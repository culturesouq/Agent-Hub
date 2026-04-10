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

type IntegrationRow = typeof operatorIntegrationsTable.$inferSelect;

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

async function refreshAccessToken(integration: IntegrationRow): Promise<string | null> {
  try {
    let refreshToken: string | null = null;

    if (integration.tokenEncrypted) {
      try {
        const raw = decryptToken(integration.tokenEncrypted);
        const parsed = JSON.parse(raw);
        refreshToken = parsed?.refresh_token ?? null;
      } catch { /* not JSON or no refresh token */ }
    }

    if (!refreshToken && integration.refreshTokenEncrypted) {
      try {
        refreshToken = decryptToken(integration.refreshTokenEncrypted);
      } catch { /* ignore */ }
    }

    if (!refreshToken) return null;

    const googleTypes = ['gmail', 'google_calendar', 'google_drive'];
    if (googleTypes.includes(integration.integrationType)) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const newTokens = await refreshRes.json() as { access_token?: string };
      if (!newTokens.access_token) return null;

      const raw = decryptToken(integration.tokenEncrypted!);
      const parsed = JSON.parse(raw);
      const newPayload = JSON.stringify({
        access_token: newTokens.access_token,
        refresh_token: parsed.refresh_token,
        email: parsed.email ?? '',
      });
      await db
        .update(operatorIntegrationsTable)
        .set({ tokenEncrypted: encryptToken(newPayload) })
        .where(eq(operatorIntegrationsTable.id, integration.id));
      console.log(`[skillExecutor] Google token refreshed for integration ${integration.id}`);
      return newTokens.access_token;
    }

    return null;
  } catch {
    return null;
  }
}

async function extractAccessToken(integration: IntegrationRow): Promise<string | null> {
  if (!integration.tokenEncrypted) return null;
  try {
    const raw = decryptToken(integration.tokenEncrypted);
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.access_token) return parsed.access_token;
    } catch { /* not JSON */ }
    return raw;
  } catch {
    return null;
  }
}

async function callIntegrationApi(
  url: string,
  token: string,
  integration: IntegrationRow,
): Promise<string | null> {
  const doFetch = (t: string) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

  let res = await doFetch(token);

  if (res.status === 401) {
    const newToken = await refreshAccessToken(integration);
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  if (!res.ok) {
    console.warn(`[skillExecutor] API returned ${res.status} for ${url}`);
    return null;
  }

  const data = await res.text();
  return data.slice(0, 4000);
}

async function fetchIntegrationData(
  integration: IntegrationRow,
  instructions: string,
): Promise<string | null> {
  try {
    const token = await extractAccessToken(integration);
    if (!token) return null;

    const baseUrl = (integration.baseUrl as string | null)
      ?? KNOWN_BASE_URLS[integration.integrationType.toLowerCase()]
      ?? `https://api.${integration.integrationType.toLowerCase()}.com`;

    const schemaContext = integration.appSchema
      ? `\n\nApp schema (available entities and actions):\n${JSON.stringify(integration.appSchema, null, 2).slice(0, 2000)}`
      : '';

    const endpointResult = await chatCompletion(
      [
        {
          role: 'system',
          content: 'You determine the correct REST API endpoint path for a given task. Return ONLY the path (e.g. /repos/owner/repo/issues). No explanation.',
        },
        {
          role: 'user',
          content: `Base URL: ${baseUrl}\nTask: ${instructions}${schemaContext}\n\nReturn only the endpoint path.`,
        },
      ],
      'anthropic/claude-haiku-4-5',
    );

    const path = endpointResult.content.trim().replace(/^["']|["']$/g, '');
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    console.log(`[skillExecutor] calling integration API: ${url}`);

    return await callIntegrationApi(url, token, integration);
  } catch (err: any) {
    console.warn('[skillExecutor] fetchIntegrationData failed:', err?.message);
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

      if (integration) {
        const data = await fetchIntegrationData(integration, instructions);
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
