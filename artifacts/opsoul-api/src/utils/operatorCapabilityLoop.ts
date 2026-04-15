/**
 * Shared operator capability loop — used by both the sync chat route and the
 * scheduled-tasks cron.  Handles:
 *   1. First-pass LLM completion
 *   2. Skill trigger detection (two-pass: user message + operator response)
 *   3. Skill execution
 *   4. Second-pass LLM completion (if a skill fired)
 *
 * Returns the final response text.
 */

import { db } from '@workspace/db';
import { operatorSkillsTable, platformSkillsTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { chatCompletion, type ChatOptions, type ChatMessage } from './openrouter.js';
import { detectSkillTrigger, type InstalledSkill } from './skillTriggerEngine.js';
import { executeSkill } from './skillExecutor.js';

export type { ChatMessage };

export interface CapabilityLoopResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  skillFired: boolean;
  skillName?: string;
}

export async function loadOperatorSkills(operatorId: string): Promise<InstalledSkill[]> {
  const installs = await db
    .select({
      id:                 operatorSkillsTable.id,
      skillId:            operatorSkillsTable.skillId,
      customInstructions: operatorSkillsTable.customInstructions,
      name:               platformSkillsTable.name,
      instructions:       platformSkillsTable.instructions,
      outputFormat:       platformSkillsTable.outputFormat,
      triggerDescription: platformSkillsTable.triggerDescription,
      integrationType:    platformSkillsTable.integrationType,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(
      and(
        eq(operatorSkillsTable.operatorId, operatorId),
        eq(operatorSkillsTable.isActive, true),
      ),
    );

  return installs.map(s => ({
    installId:          s.id,
    skillId:            s.skillId,
    name:               s.name,
    triggerDescription: s.triggerDescription ?? '',
    instructions:       s.instructions ?? '',
    outputFormat:       s.outputFormat ?? null,
    customInstructions: s.customInstructions ?? null,
    integrationType:    s.integrationType ?? null,
  }));
}

function buildSecondPassMessages(
  messages: ChatMessage[],
  firstResponse: string,
  skillOutput: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: firstResponse },
    { role: 'system',    content: `[Task completed — findings below]\n${skillOutput}` },
    {
      role: 'user',
      content:
        `You just ran a skill and received the output above. Report back to the owner directly and conversationally.\n\n` +
        `If the output says no live data was available or the connection failed — be honest. Tell the owner clearly what didn't work and what they need to set up. Do not pretend you completed work you couldn't do.\n\n` +
        `If the output has real findings — report them specifically. Highlight what matters. Be direct.\n\n` +
        `Never mention tool names, skill names, raw JSON, raw URLs, or API field names. Just speak naturally as their operator.`,
    },
  ];
}

export async function runCapabilityLoop(
  messages: ChatMessage[],
  userMessage: string,
  skills: InstalledSkill[],
  modelOrOptions: string | ChatOptions,
  operatorId?: string,
  operatorOwnerId?: string,
): Promise<CapabilityLoopResult> {
  const modelStr = typeof modelOrOptions === 'string' ? modelOrOptions : (modelOrOptions.model ?? 'claude-sonnet-4-5');

  const first = await chatCompletion(messages, modelOrOptions);
  let content            = first.content ?? '';
  let promptTokens       = first.promptTokens ?? 0;
  let completionTokens   = first.completionTokens ?? 0;
  let skillFired         = false;
  let skillName: string | undefined;

  if (skills.length > 0) {
    const trigger = await detectSkillTrigger(userMessage, skills, content);
    if (trigger) {
      if (operatorId) trigger.operatorId = operatorId;
      if (operatorOwnerId) trigger.operatorOwnerId = operatorOwnerId;
      console.log(`[capability-loop] skill triggered: ${trigger.name}`);
      const result = await executeSkill(trigger, modelStr);
      if (result.success) {
        skillFired = true;
        skillName  = trigger.name;
        const secondMsgs = buildSecondPassMessages(messages, content, result.output);
        const second = await chatCompletion(secondMsgs, modelOrOptions);
        content          = second.content ?? content;
        promptTokens     = second.promptTokens ?? promptTokens;
        completionTokens = second.completionTokens ?? completionTokens;
      }
    }
  }

  return { content, promptTokens, completionTokens, skillFired, skillName };
}
