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

// Returns the first skill triggered by the Operator response, or null.
// Checks each installed skill's triggerDescription against the response.
// Uses semantic similarity — threshold 0.55 (loose enough to catch intent, tight enough to avoid false positives).
export async function detectSkillTrigger(
  operatorResponse: string,
  installedSkills: InstalledSkill[],
): Promise<SkillTrigger | null> {
  if (!installedSkills.length) return null;

  const [responseEmbed] = await Promise.all([embed(operatorResponse)]);

  for (const skill of installedSkills) {
    if (!skill.triggerDescription) continue;
    const triggerEmbed = await embed(skill.triggerDescription);
    const dot  = responseEmbed.reduce((sum, v, i) => sum + v * triggerEmbed[i], 0);
    const magA = Math.sqrt(responseEmbed.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(triggerEmbed.reduce((s, v) => s + v * v, 0));
    const similarity = dot / (magA * magB);

    if (similarity >= 0.55) {
      return {
        installId:   skill.installId,
        skillId:     skill.skillId,
        name:        skill.name,
        instructions: skill.instructions,
        outputFormat: skill.outputFormat,
        customInstructions: skill.customInstructions,
        extractedParams: operatorResponse, // full response as context for executor
      };
    }
  }

  return null;
}
