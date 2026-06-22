/**
 * toolHandlers.ts — types / interfaces for OpSoul's tool dispatch layer.
 *
 * Phase 1c: all handler implementations removed. Tool dispatch now routes
 * through the CultureEyes SDK via sdkToolBridge.dispatchViaSdk().
 *
 * KEEP: the 4 types/interfaces below — still imported by chat.ts,
 * sdkToolBridge.ts, operatorAgentLoop.ts, mcpServer.ts, operator-skills.ts,
 * routes/mcp.ts, and operatorToolset.ts.
 */

import type { ScopeType } from './toolRegistry.js';

// ───────────────────────────────────────────────────────────────────────────
//  TYPES
// ───────────────────────────────────────────────────────────────────────────

/** Runtime context passed to every handler. */
export interface ToolHandlerContext {
  operatorId: string;
  ownerId: string;
  conversationId: string;
  /** Resolved scope from scopeResolver — handlers respect this when persisting. */
  scope: { scopeId?: string; scopeTrust?: string; scopeType: ScopeType };
  /** Operator mandate — passed to KB gate for domain fit check. */
  mandate: string;
}

/** SSE-style progress event handlers can fire as work proceeds. */
export interface ToolProgressEvent {
  /** Stable event name. Matches frontend ChatSection.tsx parsers. */
  event:
    | 'searching'
    | 'seeding'
    | 'writing'
    | 'file_created'
    | 'reading'
    | 'listing'
    | 'checking_time'
    | 'scheduling'
    | 'updating_task'
    | 'pausing_task'
    | 'resuming_task'
    | 'deleting_task'
    | 'calling';
  /** Payload shape matches the JSON the SSE write() produced in chat.ts. */
  payload: Record<string, unknown>;
}

export type ToolProgressCallback = (e: ToolProgressEvent) => void;

/** Result of a tool dispatch. */
export interface ToolResult {
  /** Text returned to the LLM as the tool-result message in the next turn. */
  content: string;
  /** Loop-control hints for the caller. None of these affect the LLM. */
  meta?: {
    /** Set to true when web_search successfully ran (chat.ts increments its cap counter). */
    webSearchFired?: boolean;
    /** Set to true when http_request ran (chat.ts uses this to suppress skill trigger). */
    httpRequestFired?: boolean;
    /** True when the caller should break its agent loop after this tool —
     *  e.g. required args were missing, or the underlying operation could
     *  not produce a useful result. Mirrors the pre-refactor break-on-
     *  failure semantics of each inline tool block. */
    terminateLoop?: boolean;
  };
}
