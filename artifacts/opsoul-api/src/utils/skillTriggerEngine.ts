import { embed } from '@workspace/opsoul-utils/ai';

export interface InstalledSkill {
  installId: string;
  skillId:   string;
  name:      string;
  triggerDescription: string;
  instructions:       string;
  outputFormat:       string | null;
  customInstructions: string | null;
}

export interface SkillTrigger {
  installId:   string;
  skillId:     string;
  name:        string;
  instructions: string;
  outputFormat: string | null;
  customInstructions: string | null;
  extractedParams: string;
}

// Returns the first skill triggered by the USER MESSAGE, or null.
// Compares the user's message against each skill's triggerDescription using cosine similarity.
// Threshold: 0.55 — loose enough to catch intent, tight enough to avoid false positives.
// The operatorResponse is passed separately as executor context only.
export async function detectSkillTrigger(
  userMessage: string,
  installedSkills: InstalledSkill[],
  operatorResponse?: string,
): Promise<SkillTrigger | null> {
  if (!installedSkills.length) return null;

  const messageEmbed = await embed(userMessage);

  for (const skill of installedSkills) {
    if (!skill.triggerDescription) continue;
    const triggerEmbed = await embed(skill.triggerDescription);
    const dot  = messageEmbed.reduce((sum, v, i) => sum + v * triggerEmbed[i], 0);
    const magA = Math.sqrt(messageEmbed.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(triggerEmbed.reduce((s, v) => s + v * v, 0));
    const similarity = dot / (magA * magB);

    console.log(`[agency] skill "${skill.name}" similarity=${similarity.toFixed(3)} threshold=0.35`);

    if (similarity >= 0.35) {
      return {
        installId:   skill.installId,
        skillId:     skill.skillId,
        name:        skill.name,
        instructions: skill.instructions,
        outputFormat: skill.outputFormat,
        customInstructions: skill.customInstructions,
        extractedParams: operatorResponse ?? userMessage, // executor context
      };
    }
  }

  return null;
}
