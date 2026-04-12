import type { operatorsTable } from '@workspace/db-v2';
import type { ChatMessage } from '../utils/openrouter.js';

export interface InstalledSkill {
  installId: string;
  skillId: string;
  name: string;
  instructions: string;
  outputFormat: string | null;
  customInstructions: string | null;
  integrationType?: string | null;
}

export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) ?? [];
  return [...new Set(matches)].slice(0, 2);
}

export function buildMergedSkills(
  installedSkills: InstalledSkill[],
  archetypeSkills: InstalledSkill[],
  operator: typeof operatorsTable.$inferSelect,
): InstalledSkill[] {
  const installedNames = new Set(installedSkills.map(s => s.name));

  let list: InstalledSkill[] = [
    ...installedSkills,
    ...archetypeSkills.filter(a => !installedNames.has(a.name)),
  ];

  if (operator.freeRoaming && operator.toolUsePolicy) {
    const rawPolicy = operator.toolUsePolicy;
    if (rawPolicy !== 'auto' && typeof rawPolicy === 'object' && rawPolicy !== null) {
      const allowedNames = new Set(Object.keys(rawPolicy as Record<string, unknown>));
      if (allowedNames.size > 0) {
        list = list.filter(s => allowedNames.has(s.name));
      }
    }
  }

  return list;
}

export function buildSkillSecondPassMessages(
  messages: ChatMessage[],
  firstResponse: string,
  skillOutput: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: firstResponse },
    { role: 'system', content: `[Task completed — findings below]\n${skillOutput}` },
    {
      role: 'user',
      content: 'You just completed a task. Report back to the owner directly — as if you did the work yourself and are now sharing what you found.\n\nBe specific. Highlight what matters. Be conversational.\n\nNever mention tool names, skill names, raw JSON, raw URLs, or API responses. Just speak naturally as their operator who got something done.',
    },
  ];
}

export function estimateTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + Math.ceil(content.length / 4);
  }, 0);
}
