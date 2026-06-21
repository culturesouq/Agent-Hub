/**
 * sdkToolBridge.ts — OpSoul → CultureEyes SDK HTTP adapter.
 *
 * All tool execution routes through the live SDK server over HTTP.
 * No local registry, no connector implementations — the SDK owns all of that.
 *
 * Two public surfaces:
 *   listToolsViaSdk(ctx)         → GET /v1/tools (filtered + description-annotated)
 *   dispatchViaSdk(name, args, …) → POST /execute (scoped per operator)
 */

import type { ToolHandlerContext } from './toolHandlers.js';
import type { ScopeType } from './toolRegistry.js';
import { db } from '@workspace/db';
import {
  operatorSecretsTable,
  operatorIntegrationsTable,
  operatorFilesTable,
  operatorKbTable,
} from '@workspace/db';
import { eq, count, gte, lt, and } from 'drizzle-orm';
import { decryptToken } from '@workspace/opsoul-utils/crypto';

// ── env ───────────────────────────────────────────────────────────────────────

const CY_SDK_URL = (process.env.CY_SDK_URL ?? '').replace(/\/$/, '');
const CY_SDK_KEY = process.env.CY_SDK_KEY ?? '';

if (!CY_SDK_URL) {
  console.warn('[sdkBridge] CY_SDK_URL not set — tool calls will fail');
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface ProvisionedListCtx {
  liveSecrets: string[];
  connectedIntegrations: string[];
  hasWebSearch: boolean;
  hasFirecrawl: boolean;
  scopeType: ScopeType;
  scopeTrust?: string;
}

// Kept for type compatibility with callers — no filtering applied.
export { ScopeType };

export interface SdkToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export type { ToolResult as OpSoulToolResult } from './toolHandlers.js';

// ── tool schema cache ─────────────────────────────────────────────────────────

interface RawSdkTool {
  name: string;
  description: string;
  schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

let _toolCache: RawSdkTool[] | null = null;

async function fetchSdkTools(): Promise<RawSdkTool[]> {
  if (_toolCache) return _toolCache;
  const res = await fetch(`${CY_SDK_URL}/v1/tools`);
  if (!res.ok) throw new Error(`[sdkBridge] GET /v1/tools failed: HTTP ${res.status}`);
  const body = await res.json() as { tools: RawSdkTool[] };
  _toolCache = body.tools;
  return _toolCache;
}

// ── list tools (async — awaited by chat.ts) ───────────────────────────────────
// Returns all SDK tools + the virtual list_workspace tool.
// No filtering — operators get everything.

export async function listToolsViaSdk(ctx: ProvisionedListCtx): Promise<SdkToolDefinition[]> {
  const all = await fetchSdkTools();

  const sdkTools = all.map(t => {
    let description = t.description;
    if (t.name === 'http_request' && ctx.liveSecrets.length > 0) {
      description = `${description} Available stored secret labels: ${ctx.liveSecrets.map(s => `{{${s}}}`).join(', ')}.`;
    }
    return {
      type: 'function' as const,
      function: {
        name: t.name,
        description,
        parameters: {
          type: 'object' as const,
          properties: t.schema.properties,
          required: t.schema.required ?? [],
        },
      },
    };
  });

  // Virtual tool — handled by OpSoul, never forwarded to SDK.
  // Gives the operator true agency: browse and choose from its full workspace.
  const listWorkspaceTool: SdkToolDefinition = {
    type: 'function',
    function: {
      name: 'list_workspace',
      description: 'Browse your complete workspace — all available tools with full descriptions, connected integrations, stored files, KB entries, and secret labels. Call this any time you want to know exactly what you have available before choosing what to use.',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            description: 'Optional keyword to narrow the tool list (e.g. "search", "file", "http", "render"). Omit to get everything.',
          },
        },
        required: [],
      },
    },
  };

  return [...sdkTools, listWorkspaceTool];
}

// ── render tool fence transform ───────────────────────────────────────────────

const RENDER_TOOLS = new Set(['render_chart', 'render_table', 'render_diagram']);

function sdkDataToOpSoulContent(
  name: string,
  sdkResult: { ok: boolean; content: string; data?: unknown },
): string {
  if (!RENDER_TOOLS.has(name) || !sdkResult.ok || !sdkResult.data) {
    return sdkResult.content;
  }
  const payload = sdkResult.data as Record<string, unknown>;
  const kind = payload.type === 'chart' ? 'chart'
    : payload.type === 'table' ? 'table'
    : payload.type === 'diagram' ? 'mermaid'
    : null;
  if (!kind) return sdkResult.content;
  const { type: _type, ...rest } = payload;
  const widget = { kind, ...rest };
  return `\`\`\`opsoul-widget\n${JSON.stringify(widget)}\n\`\`\``;
}

// ── operator secrets resolver ─────────────────────────────────────────────────

async function resolveOperatorSecrets(operatorId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: operatorSecretsTable.key, valueEncrypted: operatorSecretsTable.valueEncrypted })
    .from(operatorSecretsTable)
    .where(eq(operatorSecretsTable.operatorId, operatorId));
  const out: Record<string, string> = {};
  for (const row of rows) {
    try {
      out[row.key] = decryptToken(row.valueEncrypted);
    } catch {
      // skip unreadable entries
    }
  }
  return out;
}

// ── dispatch ──────────────────────────────────────────────────────────────────

interface SdkExecuteResult {
  ok: boolean;
  content: string;
  data?: unknown;
  error?: { code: string; message: string };
}

// ── list_workspace handler ────────────────────────────────────────────────────
// Virtual tool — assembled entirely from OpSoul's DB + SDK tool catalog.
// Never forwarded to the SDK server.

async function handleListWorkspace(
  operatorId: string,
  filter: string,
): Promise<string> {
  const keyword = filter.toLowerCase();

  const [allTools, integrations, files, kbHigh, kbMedium, kbLow, secretRows] = await Promise.all([
    fetchSdkTools(),
    db.select({ integrationType: operatorIntegrationsTable.integrationType })
      .from(operatorIntegrationsTable)
      .where(eq(operatorIntegrationsTable.operatorId, operatorId)),
    db.select({ filename: operatorFilesTable.filename })
      .from(operatorFilesTable)
      .where(eq(operatorFilesTable.operatorId, operatorId)),
    db.select({ total: count() }).from(operatorKbTable)
      .where(and(eq(operatorKbTable.operatorId, operatorId), gte(operatorKbTable.confidenceScore, 80))),
    db.select({ total: count() }).from(operatorKbTable)
      .where(and(eq(operatorKbTable.operatorId, operatorId), gte(operatorKbTable.confidenceScore, 50), lt(operatorKbTable.confidenceScore, 80))),
    db.select({ total: count() }).from(operatorKbTable)
      .where(and(eq(operatorKbTable.operatorId, operatorId), lt(operatorKbTable.confidenceScore, 50))),
    db.select({ key: operatorSecretsTable.key })
      .from(operatorSecretsTable)
      .where(eq(operatorSecretsTable.operatorId, operatorId)),
  ]);

  const matchingTools = keyword
    ? allTools.filter(t => t.name.includes(keyword) || t.description.toLowerCase().includes(keyword))
    : allTools;

  const lines: string[] = [];

  lines.push(`=== WORKSPACE — ${matchingTools.length} tool${matchingTools.length !== 1 ? 's' : ''}${keyword ? ` matching "${filter}"` : ''} of ${allTools.length} total ===`);
  lines.push('');

  lines.push('TOOLS:');
  for (const t of matchingTools) {
    lines.push(`  ${t.name} — ${t.description}`);
  }

  lines.push('');
  const integrationList = integrations.map(i => i.integrationType).filter((t): t is string => !!t);
  lines.push(`INTEGRATIONS: ${integrationList.length > 0 ? integrationList.join(', ') : 'none connected'}`);

  lines.push('');
  const fileList = files.map(f => f.filename).filter((n): n is string => !!n);
  lines.push(`FILES (${fileList.length}): ${fileList.length > 0 ? fileList.join(', ') : 'none'}`);

  lines.push('');
  lines.push(`KNOWLEDGE BASE: ${Number(kbHigh[0]?.total ?? 0)} high-confidence · ${Number(kbMedium[0]?.total ?? 0)} medium · ${Number(kbLow[0]?.total ?? 0)} low`);

  lines.push('');
  const secretLabels = secretRows.map(r => `{{${r.key}}}`);
  lines.push(`SECRETS (labels only): ${secretLabels.length > 0 ? secretLabels.join(', ') : 'none'}`);

  return lines.join('\n');
}

export async function dispatchViaSdk(
  name: string,
  rawArgs: string,
  opCtx: ToolHandlerContext,
  _extraCtx: {
    operatorName: string;
    liveSecrets: string[];
    connectedIntegrations: string[];
  },
): Promise<{ content: string; meta: { terminateLoop: boolean; webSearchFired?: boolean; httpRequestFired?: boolean } }> {
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(rawArgs) as Record<string, unknown>;
  } catch {
    params = {};
  }

  // Intercept virtual tools — never forward to SDK.
  if (name === 'list_workspace') {
    const filter = typeof params.filter === 'string' ? params.filter : '';
    const operatorId = opCtx.operatorId ?? '';
    const content = await handleListWorkspace(operatorId, filter);
    return { content, meta: { terminateLoop: false } };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (CY_SDK_KEY) headers['Authorization'] = `Bearer ${CY_SDK_KEY}`;

  // Scope per operator so memory/KB/files are isolated between operators.
  const operatorId = opCtx.operatorId;
  if (operatorId) headers['X-Scope-ID'] = `operator:${operatorId}`;

  // Fetch operator-stored secrets so the SDK can resolve {{LABEL}} in http_request
  // and any per-operator overrides for platform tools (custom OpenAI keys, etc.).
  const secrets = operatorId ? await resolveOperatorSecrets(operatorId) : {};

  const res = await fetch(`${CY_SDK_URL}/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool: name, params, ...(Object.keys(secrets).length ? { secrets } : {}) }),
  });

  const result = await res.json() as SdkExecuteResult;

  if (!res.ok && result.error) {
    return {
      content: `Tool error: ${result.error.message}`,
      meta: { terminateLoop: true },
    };
  }

  const content = sdkDataToOpSoulContent(name, result);

  return {
    content,
    meta: {
      terminateLoop: !result.ok,
      webSearchFired: name === 'web_search' && result.ok,
      httpRequestFired: name === 'http_request',
    },
  };
}
