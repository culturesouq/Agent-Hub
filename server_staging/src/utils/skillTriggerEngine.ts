import { embed } from '@workspace/opsoul-utils/ai';

export interface InstalledSkill {
  installId: string;
  skillId:   string;
  name:      string;
  triggerDescription: string;
  instructions:       string;
  outputFormat:       string | null;
  customInstructions: string | null;
  integrationType?:   string | null;
}

export interface SkillTrigger {
  installId:   string;
  skillId:     string;
  name:        string;
  instructions: string;
  outputFormat: string | null;
  customInstructions: string | null;
  extractedParams: string;
  operatorId?: string;
  operatorOwnerId?: string;
  integrationType?: string;
  initiatedBy?: 'user' | 'operator';
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot  = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (magA * magB);
}

// Returns the BEST matching skill for the given text, or null.
// Compares text against each skill's triggerDescription using cosine similarity.
function findBestMatch(
  queryEmbed: number[],
  skillEmbeds: Array<{ skill: InstalledSkill; embed: number[] }>,
  threshold: number,
): { skill: InstalledSkill; similarity: number } | null {
  let bestSkill: InstalledSkill | null = null;
  let bestSimilarity = 0;

  for (const { skill, embed: triggerEmbed } of skillEmbeds) {
    const similarity = cosineSimilarity(queryEmbed, triggerEmbed);
    if (similarity >= threshold && similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestSkill = skill;
    }
  }

  return bestSkill ? { skill: bestSkill, similarity: bestSimilarity } : null;
}

// Two-pass skill trigger detection:
//   Pass 1 — user message at threshold 0.45 (balanced intent detection)
//   Pass 2 — operator response at threshold 0.60 (higher confidence for autonomous triggering)
// Pre-embeds all skill trigger descriptions once to avoid redundant LLM calls.
export async function detectSkillTrigger(
  userMessage: string,
  installedSkills: InstalledSkill[],
  operatorResponse?: string,
): Promise<SkillTrigger | null> {
  if (!installedSkills.length) return null;

  const USER_THRESHOLD     = 0.45;
  const OPERATOR_THRESHOLD = 0.60;

  // Pre-embed all skill trigger descriptions once
  const skillEmbeds = await Promise.all(
    installedSkills
      .filter(s => !!s.triggerDescription)
      .map(async (skill) => ({ skill, embed: await embed(skill.triggerDescription) })),
  );

  if (!skillEmbeds.length) return null;

  // Pass 1 — user message
  const userEmbed = await embed(userMessage);
  const userMatch = findBestMatch(userEmbed, skillEmbeds, USER_THRESHOLD);

  if (userMatch) {
    console.log(`[agency] user-initiated → "${userMatch.skill.name}" similarity=${userMatch.similarity.toFixed(3)}`);
    return {
      installId:          userMatch.skill.installId,
      skillId:            userMatch.skill.skillId,
      name:               userMatch.skill.name,
      instructions:       userMatch.skill.instructions,
      outputFormat:       userMatch.skill.outputFormat,
      customInstructions: userMatch.skill.customInstructions,
      extractedParams:    userMessage,
      integrationType:    userMatch.skill.integrationType ?? undefined,
      initiatedBy:        'user',
    };
  }

  // Pass 2 — operator response (only if user message didn't trigger)
  if (operatorResponse) {
    const opEmbed = await embed(operatorResponse);
    const opMatch = findBestMatch(opEmbed, skillEmbeds, OPERATOR_THRESHOLD);

    if (opMatch) {
      console.log(`[agency] operator-initiated → "${opMatch.skill.name}" similarity=${opMatch.similarity.toFixed(3)}`);
      return {
        installId:          opMatch.skill.installId,
        skillId:            opMatch.skill.skillId,
        name:               opMatch.skill.name,
        instructions:       opMatch.skill.instructions,
        outputFormat:       opMatch.skill.outputFormat,
        customInstructions: opMatch.skill.customInstructions,
        extractedParams:    operatorResponse,
        integrationType:    opMatch.skill.integrationType ?? undefined,
        initiatedBy:        'operator',
      };
    }
  }

  return null;
}
