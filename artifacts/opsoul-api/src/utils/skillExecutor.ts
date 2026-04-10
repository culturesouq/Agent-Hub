import { chatCompletion } from './openrouter.js';
import { db } from '@workspace/db';
import { operatorIntegrationsTable } from '@workspace/db';
import { decryptToken, encryptToken } from '@workspace/opsoul-utils/crypto';
import { eq, and } from 'drizzle-orm';
import type { SkillTrigger } from './skillTriggerEngine.js';

export interface SkillResult {
  skillName: string;
  output:    string;
  success:   boolean;
  error?:    string;
}

const KNOWN_BASE_URLS: Record<string, string> = {
  github:           'https://api.github.com',
  notion:           'https://api.notion.com/v1',
  slack:            'https://slack.com/api',
  hubspot:          'https://api.hubapi.com',
  linear:           'https://api.linear.app/graphql',
  gmail:            'https://gmail.googleapis.com/gmail/v1',
  google_calendar:  'https://www.googleapis.com/calendar/v3',
  google_drive:     'https://www.googleapis.com/drive/v3',
};

function baseUrlFor(type: string): string {
  return KNOWN_BASE_URLS[type.toLowerCase()] ?? `https://api.${type.toLowerCase()}.com`;
}

async function fetchIntegrationData(
  baseUrl: string,
  token: string,
  instructions: string,
  integration?: { id: string; tokenEncrypted: string },
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
      if (response.status === 401 && integration) {
        try {
          const rawAgain = decryptToken(integration.tokenEncrypted);
          const parsed = JSON.parse(rawAgain);
          if (parsed?.refresh_token) {
            const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                refresh_token: parsed.refresh_token,
                grant_type: 'refresh_token',
              }),
            });
            const newTokens = await refreshRes.json() as { access_token?: string };
            if (newTokens.access_token) {
              // Persist refreshed token back to DB so future requests use it directly
              const newPayload = JSON.stringify({
                access_token: newTokens.access_token,
                refresh_token: parsed.refresh_token,
                email: parsed.email ?? '',
              });
              const newEncrypted = encryptToken(newPayload);
              await db
                .update(operatorIntegrationsTable)
                .set({ tokenEncrypted: newEncrypted })
                .where(eq(operatorIntegrationsTable.id, integration.id));
              console.log(`[skillExecutor] Google token refreshed and persisted for integration ${integration.id}`);

              const retryRes = await fetch(url, {
                headers: {
                  Authorization: `Bearer ${newTokens.access_token}`,
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
              });
              if (retryRes.ok) {
                const retryData = await retryRes.text();
                return retryData.slice(0, 4000);
              }
            }
          }
        } catch {
          // refresh failed — fall through to null
        }
      }
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
        const rawToken = decryptToken(integration.tokenEncrypted);
        let accessToken = rawToken;
        try {
          const parsed = JSON.parse(rawToken);
          if (parsed?.access_token) accessToken = parsed.access_token;
        } catch {
          // not JSON — use as-is (PAT tokens etc.)
        }
        const baseUrl = baseUrlFor(trigger.integrationType);
        const data = await fetchIntegrationData(baseUrl, accessToken, instructions, integration);
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

  const hasLiveData = !!apiContext;

  const prompt = `You are executing a skill on behalf of an AI Operator. Your output will be used by the operator to report findings back to their owner.

Skill: ${trigger.name}
Instructions: ${instructions}${outputFormatLine}

Context from the Operator's response (what triggered this skill):
${trigger.extractedParams}${apiContext}

${hasLiveData
  ? `The live API data above contains raw information. Interpret it. Extract what matters. Return a clear, human-readable findings report — specific facts, key items, important numbers, relevant names. No raw JSON, no raw URLs, no API field names. Write as if you are an agent reporting back after completing research.`
  : `You have no live data for this task. The integration is either not connected or did not return results.
Execute this skill using your reasoning and general knowledge only.
You MUST begin your response with: "Note: I'm working from reasoning only — no live data was available for this task."
Never present your output as verified data. Use language like "based on what I know", "my assessment is", or "from general knowledge".`
}`;

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
