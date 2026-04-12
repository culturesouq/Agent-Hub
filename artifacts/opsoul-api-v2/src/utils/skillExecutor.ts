import { chatCompletion } from './openrouter.js';
import { db } from '@workspace/db-v2';
import { operatorIntegrationsTable } from '@workspace/db-v2';
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

const GRAPHQL_INTEGRATIONS = new Set(['linear']);
const POST_SEARCH_INTEGRATIONS = new Set(['notion']);

function getExtraHeaders(integrationType: string): Record<string, string> {
  if (integrationType === 'notion') return { 'Notion-Version': '2022-06-28' };
  return {};
}

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
      try { refreshToken = decryptToken(integration.refreshTokenEncrypted); } catch { /* ignore */ }
    }

    if (!refreshToken) return null;

    const googleTypes = ['gmail', 'google_calendar', 'google_drive'];
    if (googleTypes.includes(integration.integrationType)) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type:    'refresh_token',
        }),
      });
      const newTokens = await refreshRes.json() as { access_token?: string };
      if (!newTokens.access_token) return null;

      const raw = decryptToken(integration.tokenEncrypted!);
      const parsed = JSON.parse(raw);
      const newPayload = JSON.stringify({
        access_token:  newTokens.access_token,
        refresh_token: parsed.refresh_token,
        email:         parsed.email ?? '',
      });
      await db.update(operatorIntegrationsTable)
        .set({ tokenEncrypted: encryptToken(newPayload) })
        .where(eq(operatorIntegrationsTable.id, integration.id));
      console.log(`[skillExecutor] Google token refreshed for integration ${integration.id}`);
      return newTokens.access_token;
    }

    return null;
  } catch { return null; }
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
  } catch { return null; }
}

async function callRestApi(url: string, token: string, integration: IntegrationRow): Promise<string | null> {
  const extraHeaders = getExtraHeaders(integration.integrationType);
  const doFetch = (t: string) => fetch(url, {
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Accept: 'application/json', ...extraHeaders },
  });

  let res = await doFetch(token);
  if (res.status === 401) {
    const newToken = await refreshAccessToken(integration);
    if (newToken) res = await doFetch(newToken);
  }
  if (!res.ok) { console.warn(`[skillExecutor] API returned ${res.status} for ${url}`); return null; }
  return (await res.text()).slice(0, 4000);
}

async function callGraphQL(baseUrl: string, query: string, token: string, integration: IntegrationRow): Promise<string | null> {
  const extraHeaders = getExtraHeaders(integration.integrationType);
  const doFetch = (t: string) => fetch(baseUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Accept: 'application/json', ...extraHeaders },
    body: JSON.stringify({ query }),
  });

  let res = await doFetch(token);
  if (res.status === 401) {
    const newToken = await refreshAccessToken(integration);
    if (newToken) res = await doFetch(newToken);
  }
  if (!res.ok) { console.warn(`[skillExecutor] GraphQL returned ${res.status}`); return null; }
  return (await res.text()).slice(0, 4000);
}

async function callPostSearch(url: string, searchBody: object, token: string, integration: IntegrationRow): Promise<string | null> {
  const extraHeaders = getExtraHeaders(integration.integrationType);
  const doFetch = (t: string) => fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Accept: 'application/json', ...extraHeaders },
    body: JSON.stringify(searchBody),
  });

  let res = await doFetch(token);
  if (res.status === 401) {
    const newToken = await refreshAccessToken(integration);
    if (newToken) res = await doFetch(newToken);
  }
  if (!res.ok) { console.warn(`[skillExecutor] POST search returned ${res.status}`); return null; }
  return (await res.text()).slice(0, 4000);
}

async function fetchIntegrationData(integration: IntegrationRow, instructions: string): Promise<string | null> {
  try {
    const token = await extractAccessToken(integration);
    if (!token) return null;

    const baseUrl = (integration.baseUrl as string | null)
      ?? KNOWN_BASE_URLS[integration.integrationType.toLowerCase()]
      ?? `https://api.${integration.integrationType.toLowerCase()}.com`;

    const schemaContext = integration.appSchema
      ? `\n\nApp schema:\n${JSON.stringify(integration.appSchema, null, 2).slice(0, 2000)}`
      : '';

    const isGraphQL   = GRAPHQL_INTEGRATIONS.has(integration.integrationType.toLowerCase());
    const isPostSearch = POST_SEARCH_INTEGRATIONS.has(integration.integrationType.toLowerCase());

    if (isGraphQL) {
      const queryResult = await chatCompletion(
        [
          { role: 'system', content: 'You determine the correct GraphQL query for a given task. Return ONLY the GraphQL operation string — no markdown, no explanation.' },
          { role: 'user', content: `API: ${baseUrl}\nTask: ${instructions}${schemaContext}\n\nReturn only the GraphQL operation.` },
        ],
        { model: 'anthropic/claude-haiku-4-5' },
      );
      const gqlQuery = queryResult.content.trim().replace(/^```[\w]*\n?|```$/g, '');
      console.log(`[skillExecutor] calling GraphQL API: ${baseUrl}`);
      return await callGraphQL(baseUrl, gqlQuery, token, integration);
    }

    if (isPostSearch) {
      const searchTermResult = await chatCompletion(
        [
          { role: 'system', content: 'Extract the search term from the task. Return ONLY the search term as a plain string.' },
          { role: 'user', content: `Task: ${instructions}\n\nReturn only the search term.` },
        ],
        { model: 'anthropic/claude-haiku-4-5' },
      );
      const searchTerm = searchTermResult.content.trim();
      const url = `${baseUrl}/search`;
      console.log(`[skillExecutor] calling POST search API: ${url}`);
      return await callPostSearch(url, { query: searchTerm, page_size: 15 }, token, integration);
    }

    const endpointResult = await chatCompletion(
      [
        { role: 'system', content: 'You determine the correct REST API endpoint path for a given task. Return ONLY the path with query parameters (e.g. /repos/owner/repo/issues?state=open). No explanation.' },
        { role: 'user', content: `Base URL: ${baseUrl}\nTask: ${instructions}${schemaContext}\n\nReturn only the endpoint path.` },
      ],
      { model: 'anthropic/claude-haiku-4-5' },
    );

    const path = endpointResult.content.trim().replace(/^["']|["']$/g, '');
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    console.log(`[skillExecutor] calling REST API: ${url}`);
    return await callRestApi(url, token, integration);

  } catch (err) {
    console.warn('[skillExecutor] fetchIntegrationData failed:', (err as Error)?.message);
    return null;
  }
}

export async function executeSkill(trigger: SkillTrigger, model: string): Promise<SkillResult> {
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
        .where(and(
          eq(operatorIntegrationsTable.operatorId, trigger.operatorId),
          eq(operatorIntegrationsTable.integrationType, trigger.integrationType),
        ))
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
    } catch (err) {
      console.warn('[skillExecutor] integration lookup failed:', (err as Error)?.message);
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
    const result = await chatCompletion([{ role: 'user', content: prompt }], { model });
    return { skillName: trigger.name, output: result.content, success: true };
  } catch (err) {
    console.error(`[skillExecutor] failed for skill ${trigger.name}:`, (err as Error)?.message);
    return { skillName: trigger.name, output: '', success: false, error: (err as Error)?.message ?? 'Unknown error' };
  }
}
