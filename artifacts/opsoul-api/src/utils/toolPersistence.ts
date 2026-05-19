/**
 * Persistence + OAuth helpers shared between chat.ts and toolHandlers.ts.
 *
 * These functions were originally defined inline in routes/chat.ts. They are
 * the side-effect machinery (DB writes, memory distillation, OAuth token
 * refresh) called by tool execution. Extracted here so the MCP refactor
 * (toolHandlers.ts) can call them without depending on chat.ts.
 *
 * Behavior is identical to the previous chat.ts versions — no logic changes
 * during extraction, only relocation. The persisted message shapes
 * ([URL Content], [Web Search], [Skill: X] Result:, [HTTP Response]) are
 * preserved because the frontend ChatSection.tsx regex-matches them.
 */

import crypto from 'crypto';
import { db } from '@workspace/db';
import {
  messagesTable,
  tasksTable,
  operatorIntegrationsTable,
} from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { decryptToken, encryptToken } from '@workspace/opsoul-utils/crypto';
import {
  storeMemory,
  distillRawContentForMemory,
} from './memoryEngine.js';
import { verifyAndStore } from './kbIntake.js';
import { triggerSelfAwareness } from './selfAwarenessEngine.js';
import { executeHttpRequest } from './httpExecutor.js';

// ───────────────────────────────────────────────────────────────────────────
//  PERSISTENCE — URL scraping result
// ───────────────────────────────────────────────────────────────────────────

export async function persistUrlScrapedResult(
  operatorId: string,
  ownerId: string,
  convId: string,
  url: string,
  content: string,
  scopeId?: string,
  scopeTrust?: string,
): Promise<void> {
  let domain = url;
  try { domain = new URL(url).hostname; } catch { /* use full url */ }
  await db.insert(messagesTable).values({
    id:             crypto.randomUUID(),
    operatorId,
    conversationId: convId,
    role:           'system',
    content:        `[URL Content] ${url}\n${content}`,
  });

  // Distill the noisy raw content into one clean fact before persisting to
  // memory. Conversation log keeps the raw output above; long-term memory
  // gets only the filtered insight.
  distillRawContentForMemory(content, `URL: ${url}`)
    .then((distilled) => {
      if (!distilled) return;
      return storeMemory(
        operatorId,
        ownerId,
        `From ${domain}: ${distilled}`,
        'fact',
        'ai_distilled',
        0.6,
        false,
        scopeId,
        scopeTrust,
      );
    })
    .catch(() => {});
}

// ───────────────────────────────────────────────────────────────────────────
//  PERSISTENCE — Web search result
// ───────────────────────────────────────────────────────────────────────────

export async function persistWebSearchResult(
  operatorId: string,
  ownerId: string,
  convId: string,
  searchQuery: string,
  capResult: { output: string },
  mandate: string,
  scopeId?: string,
  scopeTrust?: string,
): Promise<void> {
  await db.insert(messagesTable).values({
    id:             crypto.randomUUID(),
    operatorId,
    conversationId: convId,
    role:           'system',
    content:        `[Web Search] ${searchQuery}\n${capResult.output}`,
  });

  verifyAndStore(
    operatorId,
    ownerId,
    capResult.output,
    `web_search:${searchQuery}`,
    searchQuery,
    mandate,
  ).catch(() => {});

  // Distill the raw search output into one clean fact before persisting to
  // memory. Conversation log keeps the raw snippet bundle above; long-term
  // memory gets only the filtered takeaway.
  distillRawContentForMemory(capResult.output, `web search: ${searchQuery}`)
    .then((distilled) => {
      if (!distilled) return;
      return storeMemory(
        operatorId,
        ownerId,
        `Web search "${searchQuery}": ${distilled}`,
        'fact',
        'ai_distilled',
        0.65,
        false,
        scopeId,
        scopeTrust,
      );
    })
    .catch(() => {});
}

// ───────────────────────────────────────────────────────────────────────────
//  PERSISTENCE — Skill execution result
// ───────────────────────────────────────────────────────────────────────────

export async function persistSkillResult(
  operatorId: string,
  ownerId: string,
  convId: string,
  skillTrigger: { name: string; skillId: string },
  skillResult: { skillName: string; output: string },
): Promise<void> {
  await db.insert(messagesTable).values({
    id:             crypto.randomUUID(),
    operatorId,
    conversationId: convId,
    role:           'system',
    content:        `[Skill: ${skillResult.skillName}] Result:\n${skillResult.output}`,
  });

  await db.insert(tasksTable).values({
    id:               crypto.randomUUID(),
    operatorId,
    conversationId:   convId,
    contextName:      skillTrigger.name,
    taskType:         'skill_execution',
    integrationLabel: 'platform_skill',
    payload:          { skillId: skillTrigger.skillId, result: skillResult.output },
    status:           'completed',
    summary:          `Executed ${skillTrigger.name}`,
    completedAt:      new Date(),
  });

  console.log(`[agency] skill ${skillTrigger.name} executed and logged`);

  triggerSelfAwareness(operatorId, 'integration_change').catch((err) =>
    console.warn('[selfAwareness] failed:', err?.message),
  );

  // Distill the skill's raw output into one clean fact before persisting.
  // The conversation log keeps the full output above; memory gets the
  // filtered takeaway only.
  distillRawContentForMemory(skillResult.output, `skill: ${skillTrigger.name}`)
    .then((distilled) => {
      if (!distilled) return;
      return storeMemory(
        operatorId,
        ownerId,
        `Skill "${skillTrigger.name}": ${distilled}`,
        'pattern',
        'ai_distilled',
        0.6,
      );
    })
    .catch(() => {});
}

// ───────────────────────────────────────────────────────────────────────────
//  OAUTH AUTO-INJECTION — for the http_request tool
// ───────────────────────────────────────────────────────────────────────────

const OAUTH_DOMAIN_MAP: Record<string, string> = {
  'gmail.googleapis.com':         'gmail',
  'api.github.com':               'github',
  'www.googleapis.com/calendar':  'google_calendar',
  'www.googleapis.com/drive':     'google_drive',
  'api.notion.com':               'notion',
  'slack.com/api':                'slack',
  'api.hubapi.com':               'hubspot',
  'api.linear.app':               'linear',
};

const GOOGLE_TYPES = new Set(['gmail', 'google_calendar', 'google_drive']);

function detectOAuthType(url: string): string | null {
  for (const [domain, type] of Object.entries(OAUTH_DOMAIN_MAP)) {
    if (url.includes(domain)) return type;
  }
  return null;
}

type IntegrationRow = typeof operatorIntegrationsTable.$inferSelect;

function extractTokenFromRow(row: IntegrationRow): string | null {
  if (!row.tokenEncrypted) return null;
  try {
    const raw = decryptToken(row.tokenEncrypted);
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed?.access_token === 'string') return parsed.access_token;
    } catch { /* plain token, not JSON */ }
    return raw;
  } catch {
    return null;
  }
}

async function refreshGoogleAccessToken(row: IntegrationRow): Promise<string | null> {
  try {
    let refreshToken: string | null = null;
    if (row.tokenEncrypted) {
      try {
        const raw = decryptToken(row.tokenEncrypted);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed?.refresh_token === 'string') refreshToken = parsed.refresh_token;
      } catch { /* skip */ }
    }
    if (!refreshToken && row.refreshTokenEncrypted) {
      try { refreshToken = decryptToken(row.refreshTokenEncrypted); } catch { /* skip */ }
    }
    if (!refreshToken) return null;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = await resp.json() as { access_token?: string };
    if (!data.access_token) return null;

    const raw = decryptToken(row.tokenEncrypted!);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    await db.update(operatorIntegrationsTable)
      .set({ tokenEncrypted: encryptToken(JSON.stringify({ ...parsed, access_token: data.access_token })) })
      .where(eq(operatorIntegrationsTable.id, row.id));

    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * HTTP request executor with automatic OAuth token injection.
 *
 * Detects the target domain (Gmail, GitHub, Google Calendar/Drive, Notion,
 * Slack, HubSpot, Linear) and, if matched, fetches the operator's stored
 * integration token and injects it as an Authorization header. For Google
 * services, transparently refreshes expired access tokens using the stored
 * refresh token.
 *
 * Falls through to the plain executeHttpRequest for non-OAuth URLs.
 */
export async function executeHttpWithOAuth(
  operatorId: string,
  httpArgs: { method: string; url: string; headers?: Record<string, string>; body?: string },
): Promise<string> {
  const integrationType = detectOAuthType(httpArgs.url);

  if (!integrationType) {
    return executeHttpRequest(operatorId, httpArgs);
  }

  const [integrationRow] = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(and(
      eq(operatorIntegrationsTable.operatorId, operatorId),
      eq(operatorIntegrationsTable.integrationType, integrationType),
    ))
    .limit(1);

  if (!integrationRow) {
    return `HTTP 401 Unauthorized\nIntegration "${integrationType}" is not connected. Go to Integrations and connect it first.`;
  }

  const token = extractTokenFromRow(integrationRow);
  if (!token) {
    return `HTTP 401 Unauthorized\nIntegration "${integrationType}" has no valid token. Reconnect it in the Integrations tab.`;
  }

  const extraHeaders: Record<string, string> = integrationType === 'notion'
    ? { 'Notion-Version': '2022-06-28' }
    : {};

  const argsWithAuth = {
    ...httpArgs,
    headers: { ...httpArgs.headers, ...extraHeaders, Authorization: `Bearer ${token}` },
  };

  const result = await executeHttpRequest(operatorId, argsWithAuth);

  if (result.startsWith('HTTP 401') && GOOGLE_TYPES.has(integrationType)) {
    const newToken = await refreshGoogleAccessToken(integrationRow);
    if (!newToken) {
      return `HTTP 401 Unauthorized\nGoogle access token for "${integrationType}" expired and could not be refreshed. Reconnect it in the Integrations tab.`;
    }
    const argsRetry = {
      ...httpArgs,
      headers: { ...httpArgs.headers, ...extraHeaders, Authorization: `Bearer ${newToken}` },
    };
    return executeHttpRequest(operatorId, argsRetry);
  }

  if (result.startsWith('HTTP 401')) {
    return `HTTP 401 Unauthorized\nToken for "${integrationType}" was rejected. It may have expired or been revoked. Reconnect it in the Integrations tab.`;
  }

  return result;
}
