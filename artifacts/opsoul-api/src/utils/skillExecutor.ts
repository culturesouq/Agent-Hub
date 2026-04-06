import { chatCompletion } from './openrouter.js';
import { db } from '@workspace/db';
import { operatorIntegrationsTable } from '@workspace/db';
import { decryptToken } from '@workspace/opsoul-utils/crypto';
import { eq, and } from 'drizzle-orm';
import type { SkillTrigger } from './skillTriggerEngine.js';

export interface SkillResult {
  skillName: string;
  output:    string;
  success:   boolean;
  error?:    string;
}

const KNOWN_BASE_URLS: Record<string, string> = {
  github:  'https://api.github.com',
  notion:  'https://api.notion.com/v1',
  slack:   'https://slack.com/api',
  hubspot: 'https://api.hubapi.com',
  linear:  'https://api.linear.app/graphql',
};

function baseUrlFor(type: string): string {
  return KNOWN_BASE_URLS[type.toLowerCase()] ?? `https://api.${type.toLowerCase()}.com`;
}

async function fetchIntegrationData(
  baseUrl: string,
  token: string,
  instructions: string,
): Promise<string | null> {
  try {
    // Ask the LLM to construct the right endpoint path from the instructions
    const endpointResult = await chatCompletion(
      [
        {
          role: 'system',
          content: 'You determine the correct REST API endpoint path for a given task. Return ONLY the path (e.g. /repos/owner/repo/issues). No explanation.',
        },
        {
          role: 'user',
          content: `Base URL: ${baseUrl}\nTask: ${instructions}\n\nReturn only the endpoint path.`,
        },
      ],
      'anthropic/claude-haiku-4-5',
    );

    const path = endpointResult.content.trim().replace(/^["']|["']$/g, '');
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    console.log(`[skillExecutor] calling integration API: ${url}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[skillExecutor] integration API returned ${response.status}`);
      return null;
    }

    const data = await response.text();
    return data.slice(0, 4000);
  } catch (err: any) {
    console.warn('[skillExecutor] integration API call failed:', err?.message);
    return null;
  }
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

  let apiContext = '';

  // Attempt live integration call if operatorId + integrationType are set
  if (trigger.operatorId && trigger.integrationType) {
    try {
      const [integration] = await db
        .select()
        .from(operatorIntegrationsTable)
        .where(
          and(
            eq(operatorIntegrationsTable.operatorId, trigger.operatorId),
            eq(operatorIntegrationsTable.integrationType, trigger.integrationType),
          ),
        )
        .limit(1);

      if (integration?.tokenEncrypted) {
        const token = decryptToken(integration.tokenEncrypted);
        const baseUrl = baseUrlFor(trigger.integrationType);
        const data = await fetchIntegrationData(baseUrl, token, instructions);
        if (data) {
          apiContext = `\n\nLive API response from ${trigger.integrationType}:\n${data}`;
          console.log(`[skillExecutor] integration data fetched for ${trigger.integrationType}`);
        }
      } else {
        console.log(`[skillExecutor] no integration found for type=${trigger.integrationType}, operator=${trigger.operatorId} — falling back to LLM-only`);
      }
    } catch (err: any) {
      console.warn('[skillExecutor] integration lookup failed:', err?.message);
    }
  }

  const prompt = `You are executing a skill on behalf of an Operator.

Skill: ${trigger.name}
Instructions: ${instructions}${outputFormatLine}

Context from the Operator's response (what triggered this skill):
${trigger.extractedParams}${apiContext}

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
