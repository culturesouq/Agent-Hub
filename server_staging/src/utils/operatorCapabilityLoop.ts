/**
 * Shared operator capability loop — used by the scheduled-tasks cron.
 * Skill-first: detect skill before LLM, inject as context, one LLM call.
 */

import { db } from '@workspace/db';
import { operatorSkillsTable, platformSkillsTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { chatCompletion, type ChatOptions, type ChatMessage } from './openrouter.js';
import { detectSkillTrigger, type InstalledSkill } from './skillTriggerEngine.js';
import { DEFAULT_MODEL_ID } from './modelRegistry.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { searchSkillByVector } from './vectorSearch.js';

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

export async function runCapabilityLoop(
  messages: ChatMessage[],
  userMessage: string,
  operatorSkills: InstalledSkill[],
  modelOrOptions: string | ChatOptions,
  operatorId?: string,
  operatorOwnerId?: string,
): Promise<CapabilityLoopResult> {
  void operatorId; void operatorOwnerId; // retained in signature for callers

  // Detect skill BEFORE the LLM runs — inject as context, not post-response.
  let skillFired = false;
  let skillName: string | undefined;

  let messageEmbedding: number[] | null = null;
  try { messageEmbedding = await embed(userMessage); } catch { /* non-fatal */ }

  let activeSkill: { name: string; instructions: string; outputFormat: string | null } | null = null;

  // 1. Operator-specific skills first (small set, on-the-fly embed)
  if (operatorSkills.length > 0 && messageEmbedding) {
    const trigger = await detectSkillTrigger(userMessage, operatorSkills).catch(() => null);
    if (trigger) {
      activeSkill = { name: trigger.name, instructions: trigger.instructions, outputFormat: trigger.outputFormat };
    }
  }

  // 2. Platform catalog — one vector query
  if (!activeSkill && messageEmbedding) {
    const hit = await searchSkillByVector(messageEmbedding, 0.55).catch(() => null);
    if (hit) activeSkill = { name: hit.name, instructions: hit.instructions, outputFormat: hit.outputFormat };
  }

  // Inject skill before the first user message (same as chat.ts)
  const withSkill = [...messages];
  if (activeSkill) {
    const skillContent = `[Active Skill: ${activeSkill.name}]\n${activeSkill.instructions}${activeSkill.outputFormat ? `\n\nOutput format: ${activeSkill.outputFormat}` : ''}`;
    const userIdx = withSkill.findIndex(m => m.role === 'user');
    if (userIdx >= 0) {
      withSkill.splice(userIdx, 0, { role: 'system', content: skillContent });
    } else {
      withSkill.push({ role: 'system', content: skillContent });
    }
    skillFired = true;
    skillName = activeSkill.name;
    console.log(`[capability-loop] skill-first: "${activeSkill.name}"`);
  }

  const result = await chatCompletion(withSkill, modelOrOptions);
  return {
    content:          result.content ?? '',
    promptTokens:     result.promptTokens ?? 0,
    completionTokens: result.completionTokens ?? 0,
    skillFired,
    skillName,
  };
}
