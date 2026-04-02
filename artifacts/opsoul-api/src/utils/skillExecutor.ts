import { chatCompletion } from './openrouter.js';
import type { SkillTrigger } from './skillTriggerEngine.js';

export interface SkillResult {
  skillName:  string;
  output:     string;
  success:    boolean;
  error?:     string;
}

export async function executeSkill(
  trigger: SkillTrigger,
  model: string,
): Promise<SkillResult> {
  const instructions = trigger.customInstructions
    ? `${trigger.instructions}\n\nAdditional instructions: ${trigger.customInstructions}`
    : trigger.instructions;

  const outputFormatLine = trigger.outputFormat
    ? `\n\nReturn your response in this format: ${trigger.outputFormat}`
    : '';

  const prompt = `You are executing a skill on behalf of an Operator.

Skill: ${trigger.name}
Instructions: ${instructions}${outputFormatLine}

Context from the Operator's response (what triggered this skill):
${trigger.extractedParams}

Execute the skill now. Return only the result — no explanation, no preamble.`;

  try {
    const result = await chatCompletion(
      [{ role: 'user', content: prompt }],
      model,
    );
    return {
      skillName: trigger.name,
      output:    result.content,
      success:   true,
    };
  } catch (err: any) {
    console.error(`[skillExecutor] failed for skill ${trigger.name}:`, err?.message);
    return {
      skillName: trigger.name,
      output:    '',
      success:   false,
      error:     err?.message ?? 'Unknown error',
    };
  }
}
