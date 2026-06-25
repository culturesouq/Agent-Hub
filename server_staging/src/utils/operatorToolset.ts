/**
 * Shared operator-toolset builder (Phase 1B / D-4).
 *
 * Patent claims 4, 9, 31, 36 describe the universal-tool substrate applying
 * to "every inbound request". Before this module, only `chat.ts` (owner Hub)
 * wired tools into the LLM call; `public-chat.ts`, `public-crud.ts`,
 * `telegram-webhook.ts`, and `whatsapp-webhook.ts` all called the agent
 * with `{ model }` only — silently capability-stripped.
 *
 * `buildOperatorToolset()` returns the trio every surface needs to expose
 * the FULL universal tool set to the operator:
 *   - `toolHandlerCtx`  — handed to `dispatchTool` so handlers can persist
 *                          side effects under the right operator / scope.
 *   - `toolListCtx`     — handed to `listToolsForContext` to filter the
 *                          registry by scope + availability + secrets.
 *   - `tools`           — the actual `ToolDefinition[]` to attach to the
 *                          LLM call this turn.
 *
 * Per [[no-fallbacks]] + [[expand-never-cut]]: this helper offers EVERY tool
 * the operator could use on the given scope. The registry's scope filter is
 * the only gate; we do not subset further at the surface layer.
 */

import { listToolsForContext } from './toolRegistry.js';
import type { ToolDefinition } from './openrouter.js';
import type { ToolHandlerContext } from './toolHandlers.js';
import { isWebSearchAvailable, isFirecrawlAvailable } from './capabilityEngine.js';
import type { ScopeType, ValidatedScope } from './scopeResolver.js';

export interface OperatorToolsetInput {
  operatorId: string;
  ownerId: string;
  conversationId: string;
  scope: ValidatedScope;
  mandate: string;
  /** Operator's stored secret labels for {{secret-label}} interpolation in http_request descriptions. */
  liveSecrets?: string[];
  /** Operator's connected integration types — gates 'integration'-availability tools. */
  connectedIntegrations?: string[];
}

export interface OperatorToolset {
  toolHandlerCtx: ToolHandlerContext;
  toolListCtx: {
    scopeType: ScopeType;
    hasWebSearch: boolean;
    /** Firecrawl D-6 — gates the 5 firecrawl_* tools. Owner directive 2026-06-02:
     *  every operator does KB seeding, so this MUST reflect platform availability
     *  (don't strip the capability). Wired here per [[expand-never-cut]]. */
    hasFirecrawl: boolean;
    liveSecrets: string[];
    connectedIntegrations: string[];
  };
  tools: ToolDefinition[];
}

export function buildOperatorToolset(input: OperatorToolsetInput): OperatorToolset {
  const liveSecrets = input.liveSecrets ?? [];
  const connectedIntegrations = input.connectedIntegrations ?? [];

  const toolHandlerCtx: ToolHandlerContext = {
    operatorId: input.operatorId,
    ownerId: input.ownerId,
    conversationId: input.conversationId,
    scope: {
      scopeId: input.scope.scopeId,
      scopeTrust: input.scope.scopeTrust,
      scopeType: input.scope.scopeType,
    },
    mandate: input.mandate,
  };

  const toolListCtx = {
    scopeType: input.scope.scopeType,
    hasWebSearch: isWebSearchAvailable(),
    hasFirecrawl: isFirecrawlAvailable(),
    liveSecrets,
    connectedIntegrations,
  };

  const tools = listToolsForContext(toolListCtx);

  return { toolHandlerCtx, toolListCtx, tools };
}
