/**
 * Shared operator capability loop — used by the scheduled-tasks cron.
 * Universal skill model: embed once, retrieve from platform catalog,
 * surface in self-awareness context before the user message. One LLM call.
 */

import { chatCompletion, type ChatOptions, type ChatMessage } from './bedrock.js';
import { searchSkillByVector } from './vectorSearch.js';

export type { ChatMessage };

export interface CapabilityLoopResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  skillFired: boolean;
  skillName?: string;
}

export async function runCapabilityLoop(
  messages: ChatMessage[],
  messageEmbedding: number[] | null,
  modelOrOptions: string | ChatOptions,
): Promise<CapabilityLoopResult> {
  // Retrieve relevant skills from the universal catalog — one vector query.
  const surfacedSkills = messageEmbedding
    ? await searchSkillByVector(messageEmbedding).catch(() => [])
    : [];

  // Surface skills in self-awareness context immediately before the task turn.
  const withContext = [...messages];
  if (surfacedSkills.length > 0) {
    const skillsContent = [
      '[SKILLS — relevant to this task]',
      ...surfacedSkills.map((s, i) =>
        `${i + 1}. ${s.name}\n${s.instructions}${s.outputFormat ? `\n\nOutput format: ${s.outputFormat}` : ''}`
      ),
      '\n[Apply what aligns with your mandate. You decide.]',
    ].join('\n\n');
    const userIdx = withContext.findIndex(m => m.role === 'user');
    const skillMsg: ChatMessage = { role: 'system', content: skillsContent };
    if (userIdx >= 0) {
      withContext.splice(userIdx, 0, skillMsg);
    } else {
      withContext.push(skillMsg);
    }
  }

  const result = await chatCompletion(withContext, modelOrOptions);
  return {
    content:          result.content ?? '',
    promptTokens:     result.promptTokens ?? 0,
    completionTokens: result.completionTokens ?? 0,
    skillFired:       surfacedSkills.length > 0,
    skillName:        surfacedSkills[0]?.name,
  };
}
