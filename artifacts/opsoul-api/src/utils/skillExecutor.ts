import { chatCompletion } from './openrouter.js';
import { db } from '@workspace/db';
import { operatorIntegrationsTable } from '@workspace/db';
import { decryptToken, encryptToken } from '@workspace/opsoul-utils/crypto';
import { eq, and } from 'drizzle-orm';
import type { SkillTrigger } from './skillTriggerEngine.js';
import { webSearch } from './webSearch.js';
import { executeHttpRequest } from './httpExecutor.js';
import { writeOperatorFile } from './fileExecutor.js';
import { seedKbEntry } from './kbSeedExecutor.js';

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

// Integration types that use GraphQL (POST with {query} body)
const GRAPHQL_INTEGRATIONS = new Set(['linear']);

// Integration types that require POST for search/read operations
const POST_SEARCH_INTEGRATIONS = new Set(['notion']);

// Extra headers required by specific integrations
function getExtraHeaders(integrationType: string): Record<string, string> {
  if (integrationType === 'notion') {
    return { 'Notion-Version': '2022-06-28' };
  }
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

async function callRestApi(
  url: string,
  token: string,
  integration: IntegrationRow,
): Promise<string | null> {
  const extraHeaders = getExtraHeaders(integration.integrationType);
  const doFetch = (t: string) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...extraHeaders,
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

async function callGraphQL(
  baseUrl: string,
  query: string,
  token: string,
  integration: IntegrationRow,
): Promise<string | null> {
  const extraHeaders = getExtraHeaders(integration.integrationType);
  const doFetch = (t: string) =>
    fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify({ query }),
    });

  let res = await doFetch(token);

  if (res.status === 401) {
    const newToken = await refreshAccessToken(integration);
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  if (!res.ok) {
    console.warn(`[skillExecutor] GraphQL API returned ${res.status} for ${baseUrl}`);
    return null;
  }

  const data = await res.text();
  return data.slice(0, 4000);
}

async function callPostSearch(
  url: string,
  searchBody: object,
  token: string,
  integration: IntegrationRow,
): Promise<string | null> {
  const extraHeaders = getExtraHeaders(integration.integrationType);
  const doFetch = (t: string) =>
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(searchBody),
    });

  let res = await doFetch(token);

  if (res.status === 401) {
    const newToken = await refreshAccessToken(integration);
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  if (!res.ok) {
    console.warn(`[skillExecutor] POST search API returned ${res.status} for ${url}`);
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

    const isGraphQL = GRAPHQL_INTEGRATIONS.has(integration.integrationType.toLowerCase());
    const isPostSearch = POST_SEARCH_INTEGRATIONS.has(integration.integrationType.toLowerCase());

    if (isGraphQL) {
      const queryResult = await chatCompletion(
        [
          {
            role: 'system',
            content: 'You determine the correct GraphQL query for a given task. Return ONLY the GraphQL operation string — no markdown fences, no explanation, no variable declarations. Example: { viewer { name } }',
          },
          {
            role: 'user',
            content: `API: ${baseUrl}\nTask: ${instructions}${schemaContext}\n\nReturn only the GraphQL operation.`,
          },
        ],
        'anthropic/claude-haiku-4-5',
      );

      const gqlQuery = queryResult.content.trim().replace(/^```[\w]*\n?|```$/g, '');
      console.log(`[skillExecutor] calling GraphQL API: ${baseUrl}`);
      return await callGraphQL(baseUrl, gqlQuery, token, integration);
    }

    if (isPostSearch) {
      const searchTermResult = await chatCompletion(
        [
          {
            role: 'system',
            content: 'Extract the search term or query from the task description. Return ONLY the search term as a plain string. No explanation.',
          },
          {
            role: 'user',
            content: `Task: ${instructions}\n\nReturn only the search term.`,
          },
        ],
        'anthropic/claude-haiku-4-5',
      );

      const searchTerm = searchTermResult.content.trim();
      const url = `${baseUrl}/search`;
      console.log(`[skillExecutor] calling POST search API: ${url}`);
      return await callPostSearch(url, { query: searchTerm, page_size: 15 }, token, integration);
    }

    // Standard REST GET
    const endpointResult = await chatCompletion(
      [
        {
          role: 'system',
          content: 'You determine the correct REST API endpoint path for a given task. Return ONLY the path with query parameters (e.g. /repos/owner/repo/issues?state=open). No explanation.',
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

    console.log(`[skillExecutor] calling REST API: ${url}`);

    return await callRestApi(url, token, integration);
  } catch (err: any) {
    console.warn('[skillExecutor] fetchIntegrationData failed:', err?.message);
    return null;
  }
}

async function extractParams<T extends object>(
  context: string,
  schema: string,
  model: string,
): Promise<T | null> {
  try {
    const result = await chatCompletion(
      [
        {
          role: 'system',
          content: `Extract parameters from the provided context and return them as a valid JSON object matching this schema: ${schema}. Return ONLY valid JSON — no markdown fences, no explanation.`,
        },
        { role: 'user', content: context },
      ],
      model,
    );
    const raw = result.content.trim().replace(/^```[\w]*\n?|```$/g, '');
    return JSON.parse(raw) as T;
  } catch {
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

  const integrationType = trigger.integrationType?.toLowerCase() ?? '';

  try {
    // ── web_search ───────────────────────────────────────────────────────
    if (integrationType === 'web_search') {
      const params = await extractParams<{ query: string }>(
        `Context: ${trigger.extractedParams}\nInstructions: ${instructions}`,
        '{ "query": "string — the search query to run" }',
        'anthropic/claude-haiku-4-5',
      );
      const query = params?.query?.trim() || trigger.extractedParams.slice(0, 200);
      console.log(`[skillExecutor] web_search: "${query}"`);
      const hits = await webSearch(query);
      if (!hits.length) {
        return { skillName: trigger.name, output: 'Web search returned no results.', success: false, error: 'No results' };
      }
      const searchContext = hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.snippet}`).join('\n\n');
      const synthesisResult = await chatCompletion(
        [
          {
            role: 'system',
            content: 'You are executing a skill on behalf of an AI Operator. Synthesize the search results into a clear, useful answer. Cite sources where relevant.',
          },
          {
            role: 'user',
            content: `Skill: ${trigger.name}\nInstructions: ${instructions}${outputFormatLine}\n\nSearch results:\n${searchContext}`,
          },
        ],
        model,
      );
      return { skillName: trigger.name, output: synthesisResult.content, success: true };
    }

    // ── http_request ─────────────────────────────────────────────────────
    if (integrationType === 'http_request') {
      if (!trigger.operatorId) {
        return { skillName: trigger.name, output: 'HTTP request skill requires operatorId.', success: false, error: 'Missing operatorId' };
      }
      const params = await extractParams<{
        method: string;
        url: string;
        headers?: Record<string, string>;
        body?: string;
      }>(
        `Context: ${trigger.extractedParams}\nInstructions: ${instructions}`,
        '{ "method": "GET|POST|PUT|PATCH|DELETE", "url": "full URL", "headers": { "key": "value" }, "body": "optional request body string" }',
        'anthropic/claude-haiku-4-5',
      );
      if (!params?.method || !params?.url) {
        return { skillName: trigger.name, output: 'Could not extract HTTP request parameters from context.', success: false, error: 'Parameter extraction failed' };
      }
      console.log(`[skillExecutor] http_request: ${params.method} ${params.url}`);
      const httpResult = await executeHttpRequest(trigger.operatorId, params);
      return { skillName: trigger.name, output: httpResult, success: true };
    }

    // ── write_file ───────────────────────────────────────────────────────
    if (integrationType === 'write_file') {
      if (!trigger.operatorId || !trigger.operatorOwnerId) {
        return { skillName: trigger.name, output: 'Write file skill requires operatorId and operatorOwnerId.', success: false, error: 'Missing IDs' };
      }
      const params = await extractParams<{ filename: string; content: string }>(
        `Context: ${trigger.extractedParams}\nInstructions: ${instructions}`,
        '{ "filename": "the file name with extension", "content": "the full content to write" }',
        'anthropic/claude-haiku-4-5',
      );
      if (!params?.filename || !params?.content) {
        return { skillName: trigger.name, output: 'Could not extract file write parameters from context.', success: false, error: 'Parameter extraction failed' };
      }
      console.log(`[skillExecutor] write_file: "${params.filename}"`);
      const fileResult = await writeOperatorFile(trigger.operatorId, trigger.operatorOwnerId, params.filename, params.content);
      return { skillName: trigger.name, output: fileResult.message, success: fileResult.success };
    }

    // ── kb_seed ──────────────────────────────────────────────────────────
    if (integrationType === 'kb_seed') {
      if (!trigger.operatorId || !trigger.operatorOwnerId) {
        return { skillName: trigger.name, output: 'KB seed skill requires operatorId and operatorOwnerId.', success: false, error: 'Missing IDs' };
      }
      const params = await extractParams<{ content: string; source: string; confidence?: number }>(
        `Context: ${trigger.extractedParams}\nInstructions: ${instructions}`,
        '{ "content": "the knowledge content to store (minimum 50 characters)", "source": "source name or description", "confidence": 65 }',
        'anthropic/claude-haiku-4-5',
      );
      if (!params?.content || !params?.source) {
        return { skillName: trigger.name, output: 'Could not extract KB seed parameters from context.', success: false, error: 'Parameter extraction failed' };
      }
      console.log(`[skillExecutor] kb_seed: source="${params.source}"`);
      const confidence = Math.max(40, Math.min(85, params.confidence ?? 65));
      const seedResult = await seedKbEntry(trigger.operatorId, trigger.operatorOwnerId, params.content, params.source, confidence);
      if (!seedResult.stored) {
        return { skillName: trigger.name, output: `KB entry not stored: ${seedResult.reason}`, success: false, error: seedResult.reason };
      }
      return {
        skillName: trigger.name,
        output: `Knowledge entry stored from "${params.source}". Confidence: ${confidence}. Status: pending — queued for VAEL verification.`,
        success: true,
      };
    }

    // ── OAuth integrations (default path) ────────────────────────────────
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
          console.log(`[skillExecutor] no integration found for type=${trigger.integrationType}, operator=${trigger.operatorId}`);
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
  : `You have no live data for this task. The integration is either not connected or did not return results. Execute this skill using your reasoning and general knowledge only.`
}`;

    const result = await chatCompletion([{ role: 'user', content: prompt }], model);
    return { skillName: trigger.name, output: result.content, success: true };

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
