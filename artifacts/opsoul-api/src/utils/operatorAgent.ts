/**
 * OperatorAgent — the operator-in-control layer.
 *
 * Per patent (SoT § 4 Vision Lock):
 *   user message → operator receives → operator decides → operator asks
 *   LLM to execute → LLM returns to operator → operator delivers.
 *
 * The operator is the driver of every turn. The LLM is the engine the
 * operator calls when computation is needed. The user never speaks to the
 * LLM directly; the user speaks to the operator. The operator decides what
 * to ask the LLM and whether tools are needed for this turn.
 *
 * Methods:
 *   analyse() — operator-mediated decision BEFORE the LLM is called.
 *               Returns 'chat' (no tools) or 'execute' (tools available).
 *   executeSync() / executeStreaming() — operator dispatches the LLM.
 *
 * No fallback paths: this class never substitutes operator output, never
 * produces text on the operator's behalf. The operator either ships its
 * real reply or the caller gets a real error. Validation / firewall
 * substitution was removed 2026-05-15 per the no-fallback rule
 * ([[feedback_no_fallbacks]]).
 */

import type { ScopeType } from './scopeResolver.js';
import { chatCompletion, streamChat, type ChatMessage, type ChatOptions, type StreamChunk, type CompletionResult } from './openrouter.js';

export type AnalyseDecision =
  | { kind: 'execute' }   // operator dispatches LLM WITH tools available
  | { kind: 'chat' };     // operator dispatches LLM WITHOUT tools — pure text reply

// Heuristics — patterns the operator uses to decide whether a turn needs tool access.
// Conservative: when in doubt, return `chat`. Tool use is a deliberate operator
// decision, not an LLM default. Per patent: the operator decides; the LLM is the engine.
const ACTION_VERB_PATTERN = /\b(search|find|look\s+up|lookup|check|fetch|get|query|read|write|create|save|store|schedule|book|remind|browse|visit|crawl|scrape|list|update|delete|pause|resume|send|post|email|message|call|run|execute|trigger|http|api|request|generate|build|make|set\s+up|configure|install|deploy|publish)\b/i;
const URL_PATTERN = /https?:\/\/|www\.|\.[a-z]{2,4}\//i;
const FILE_PATTERN = /\.(md|txt|csv|json|html|pdf|docx?|xlsx?|png|jpg|jpeg|yml|yaml|sql|sh|ts|tsx|js|jsx|py|go|rs)\b/i;
// Time keywords stay tool-eligible because the operator may want get_current_time.
const TIME_QUERY_PATTERN = /\b(what\s+time|current\s+time|today's\s+date|right\s+now|timezone)\b/i;

export function detectToolNeed(userMessage: string): boolean {
  const m = userMessage ?? '';
  if (m.length > 200) return true;
  if (URL_PATTERN.test(m)) return true;
  if (FILE_PATTERN.test(m)) return true;
  if (TIME_QUERY_PATTERN.test(m)) return true;
  if (ACTION_VERB_PATTERN.test(m)) return true;
  return false;
}

export interface OperatorAgentInit {
  operatorId: string;
  operatorName: string;
  /** Birth-mode operators must engage with identity questions during creation. */
  isBirthMode: boolean;
  /** Scope type the operator is in this turn — propagated for telemetry / future intent rules. */
  scopeType: ScopeType;
}

export class OperatorAgent {
  constructor(public init: OperatorAgentInit) {}

  /**
   * Operator analyses the user message and decides this turn's mode.
   *
   * Birth-mode operators always get 'execute' — newborns need the full
   * LLM context to engage with identity questions during birth.
   *
   * Architecture-introspection questions are NOT specially handled. The
   * operator answers them in its own voice, like any other question. If
   * the operator says something it shouldn't, that's a teaching moment
   * with that operator — not a platform-level substitution.
   */
  analyse(userMessage: string): AnalyseDecision {
    if (this.init.isBirthMode) return { kind: 'execute' };
    if (detectToolNeed(userMessage)) return { kind: 'execute' };
    return { kind: 'chat' };
  }

  /**
   * Operator dispatches a single non-streaming LLM call. Used by webhook
   * routes (Telegram, WhatsApp) and the action API (public-crud).
   */
  async executeSync(
    messages: ChatMessage[],
    opts: ChatOptions = {},
  ): Promise<CompletionResult> {
    return await chatCompletion(messages, opts);
  }

  /**
   * Operator dispatches a streaming LLM call. Used by Hub UI (chat.ts)
   * and public-chat (slot deployments).
   */
  executeStreaming(
    messages: ChatMessage[],
    opts: ChatOptions = {},
  ): AsyncGenerator<StreamChunk> {
    return streamChat(messages, opts);
  }
}
