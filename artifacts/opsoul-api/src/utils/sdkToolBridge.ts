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
import type { ScopeType, Availability } from './toolRegistry.js';
import { UNIVERSAL_TOOLS } from './toolRegistry.js';

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

// ── provisioned list ──────────────────────────────────────────────────────────

function buildProvisionedList(ctx: ProvisionedListCtx): Set<string> {
  const names = new Set<string>();
  for (const tool of UNIVERSAL_TOOLS) {
    const avail: Availability = tool.availability;
    if (avail === 'web' && !ctx.hasWebSearch) continue;
    if (avail === 'secrets' && ctx.liveSecrets.length === 0) continue;
    if (avail === 'integration' && ctx.connectedIntegrations.length === 0) continue;
    if (avail === 'firecrawl' && !ctx.hasFirecrawl) continue;
    const scopes = tool.scopes;
    if (scopes !== '*' && !scopes.includes(ctx.scopeType)) continue;
    names.add(tool.name);
  }
  return names;
}

// ── list tools (async — awaited by chat.ts) ───────────────────────────────────

export async function listToolsViaSdk(ctx: ProvisionedListCtx): Promise<SdkToolDefinition[]> {
  const all = await fetchSdkTools();
  const provisioned = buildProvisionedList(ctx);

  return all
    .filter(t => provisioned.has(t.name))
    .map(t => {
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

// ── dispatch ──────────────────────────────────────────────────────────────────

interface SdkExecuteResult {
  ok: boolean;
  content: string;
  data?: unknown;
  error?: { code: string; message: string };
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (CY_SDK_KEY) headers['Authorization'] = `Bearer ${CY_SDK_KEY}`;

  // Scope per operator so memory/KB/files are isolated between operators.
  const operatorId = opCtx.operatorId;
  if (operatorId) headers['X-Scope-ID'] = `operator:${operatorId}`;

  const res = await fetch(`${CY_SDK_URL}/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool: name, params }),
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
