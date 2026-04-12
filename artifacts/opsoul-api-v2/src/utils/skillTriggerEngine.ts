import { embed } from '@workspace/opsoul-utils/ai';

export interface InstalledSkill {
  installId:          string;
  skillId:            string;
  name:               string;
  triggerDescription: string;
  instructions:       string;
  outputFormat:       string | null;
  customInstructions: string | null;
  integrationType?:   string | null;
}

export interface SkillTrigger {
  installId:          string;
  skillId:            string;
  name:               string;
  instructions:       string;
  outputFormat:       string | null;
  customInstructions: string | null;
  extractedParams:    string;
  operatorId?:        string;
  integrationType?:   string;
}

// Returns the best matching skill for the user message, or null.
// Compares the user's message against each skill's triggerDescription using cosine similarity.
// Threshold: 0.45 — balanced to catch clear intent while avoiding false positives.
export async function detectSkillTrigger(
  userMessage: string,
  installedSkills: InstalledSkill[],
  operatorResponse?: string,
): Promise<SkillTrigger | null> {
  if (!installedSkills.length) return null;

  const TRIGGER_THRESHOLD = 0.45;
  const messageEmbed = await embed(userMessage);

  let bestSkill: InstalledSkill | null = null;
  let bestSimilarity = 0;

  for (const skill of installedSkills) {
    if (!skill.triggerDescription) continue;
    const triggerEmbed = await embed(skill.triggerDescription);
    const dot  = messageEmbed.reduce((sum, v, i) => sum + v * triggerEmbed[i], 0);
    const magA = Math.sqrt(messageEmbed.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(triggerEmbed.reduce((s, v) => s + v * v, 0));
    const similarity = dot / (magA * magB);

    console.log(`[agency] skill "${skill.name}" similarity=${similarity.toFixed(3)} threshold=${TRIGGER_THRESHOLD}`);

    if (similarity >= TRIGGER_THRESHOLD && similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestSkill = skill;
    }
  }

  if (!bestSkill) return null;
  console.log(`[agency] best match → "${bestSkill.name}" similarity=${bestSimilarity.toFixed(3)}`);

  return {
    installId:          bestSkill.installId,
    skillId:            bestSkill.skillId,
    name:               bestSkill.name,
    instructions:       bestSkill.instructions,
    outputFormat:       bestSkill.outputFormat,
    customInstructions: bestSkill.customInstructions,
    extractedParams:    operatorResponse ?? userMessage,
    integrationType:    bestSkill.integrationType ?? undefined,
  };
}
