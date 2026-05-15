/**
 * OperatorAgent — the operator-in-control layer.
 *
 * PRIORITY 2 from owner direction 2026-05-14:
 *   user message → operator receives → operator analyses → operator asks
 *   LLM to execute → LLM executes → LLM returns to operator → operator
 *   analyses & turns it → operator responds to user.
 *
 * The operator is the driver of every turn. The LLM is the engine the
 * operator calls when computation is needed. The user never speaks to the
 * LLM directly; the user speaks to the operator. The operator decides what
 * to ask the LLM, what to do with what comes back, and how to deliver the
 * response.
 *
 * STEP 1 of the operator-as-driver build:
 *   - analyse() — operator-mediated decision BEFORE any LLM is called
 *   - validate() — operator-mediated check AFTER the LLM produces a draft
 *   - composeArchitectureRefusal() — operator's direct voice for refusals
 *     where no LLM call is needed
 *
 * The analyse + validate boundaries put real operator agency in code at
 * both edges of every chat turn. The route layers (chat / public-chat /
 * telegram-webhook / whatsapp-webhook / public-crud) call these methods
 * instead of inlining the decisions, so the operator's agency is visible
 * across every chat surface and behaves identically.
 *
 * STEP 2 (future, owner-validated, separate session) will add:
 *   - intent classification (cheap LLM call for ambiguous turns) so analyse
 *     can route to refuse_unsafe / clarify / delegate_skill / etc.
 *   - soul-fidelity check in validate() — does the draft sound like THIS
 *     operator, or has the LLM drifted to generic-assistant tone?
 *   - explicit compose pass — second LLM call framed as "given these
 *     facts, the operator composes the reply" — for turns where the first
 *     LLM call needs operator-led refinement before delivery.
 *
 * This file deliberately does NOT contain the LLM execution logic itself
 * (streaming, tool-loop, model selection). That stays in the route layer
 * for now — extracting it cleanly is part of Step 2.
 */

import {
  applyFirewall,
  isArchitectureQuestion,
  FIREWALL_SUBSTITUTE_REPLY,
  type FirewallTrigger,
} from './architectureFirewall.js';
import type { ScopeType } from './scopeResolver.js';
import { chatCompletion, streamChat, type ChatMessage, type ToolDefinition, type ChatOptions, type StreamChunk, type CompletionResult } from './openrouter.js';

export type AnalyseDecision =
  | { kind: 'execute' }            // operator dispatches LLM WITH tools available
  | { kind: 'chat' }               // operator dispatches LLM WITHOUT tools — pure text reply
  | { kind: 'refuse_architecture' };

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
  if (m.length > 200) return true; // long messages likely complex enough to need tools
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

export interface ValidationResult {
  /** Final text to deliver to the user. May be the substitute reply if blocked. */
  text: string;
  /** True if the draft was substituted (firewall block). */
  substituted: boolean;
  /** All firewall triggers (block + log_only) for telemetry / pattern tuning. */
  triggers: FirewallTrigger[];
}

export class OperatorAgent {
  constructor(public init: OperatorAgentInit) {}

  /**
   * STEP 1 — Operator analyses the user message and decides this turn's mode.
   *
   * Per patent: the operator is the driver, the LLM is the engine. The
   * operator decides whether tools are needed BEFORE the LLM ever sees the
   * message. The LLM does not autonomously decide to call tools — it only
   * acts when the operator gives it the tool catalog.
   *
   * Outcomes:
   *   refuse_architecture — operator handles in its own voice, no LLM call.
   *                         Used for architecture-introspection questions.
   *   chat                — operator dispatches LLM with NO tool catalog.
   *                         Pure text generation. Default for conversational
   *                         input (greetings, casual messages, identity
   *                         questions, short replies). The LLM cannot call
   *                         a tool because no tools are offered.
   *   execute             — operator dispatches LLM WITH tool catalog.
   *                         Used when the message signals a task that needs
   *                         external action (action verbs, URLs, file refs,
   *                         time queries, long requests).
   *
   * Birth-mode operators bypass the chat/execute split — birth needs the
   * full LLM context to engage with identity questions.
   */
  analyse(userMessage: string): AnalyseDecision {
    if (this.init.isBirthMode) return { kind: 'execute' };
    if (isArchitectureQuestion(userMessage)) return { kind: 'refuse_architecture' };
    if (detectToolNeed(userMessage)) return { kind: 'execute' };
    return { kind: 'chat' };
  }

  /**
   * STEP 3 — Operator validates the LLM's draft response.
   *
   * After the LLM has executed (with tools, with retrieved context, with
   * the operator's identity and scope context in its system prompt), the
   * operator inspects the draft. If the draft contains patent-protected
   * vocabulary (5-layer architecture names, GROW engine internals, scope
   * mechanism names, memory-table identifiers, etc.), the operator
   * substitutes a refusal in its own voice. Otherwise the draft passes
   * through unchanged.
   *
   * The architecture firewall is the regex-pattern guardrail the operator
   * uses for this step. It is structural insurance that operates regardless
   * of which LLM produced the draft (Sonnet, Kimi, DeepSeek, future).
   */
  validate(draftText: string): ValidationResult {
    const result = applyFirewall(draftText);
    return {
      text: result.text,
      substituted: result.blocked,
      triggers: result.triggers,
    };
  }

  /**
   * Operator's direct refusal text for architecture-introspection questions.
   *
   * Used when analyse() returns refuse_architecture. The operator answers
   * with the substitute reply — predictable, in operator-natural voice,
   * no LLM call, no loop risk.
   */
  composeArchitectureRefusal(): string {
    return FIREWALL_SUBSTITUTE_REPLY;
  }

  // ─── STEP 2 — Operator-owned LLM dispatch ────────────────────────────
  //
  // The operator dispatches the LLM as its executor. The semantics in code:
  // these methods belong to the operator (not the route, not openrouter).
  // The route asks `agent.execute*()` — making explicit that the operator
  // is the caller, the LLM is the called engine.
  //
  // Patent claim integrity: the operator's voice is established by the
  // operator's identity / soul / character / scope context which the
  // operator places into the system prompt before calling the LLM. The
  // LLM produces output IN that voice. The operator validates the output
  // before delivery (validate() above). The user never speaks to the
  // LLM — the user speaks to the operator. This is true at the code
  // structure level as well as in the deployment.
  //
  // The system prompt is built outside this class (assembleOperatorPrompt
  // in systemPrompt.ts) because operator-identity construction is shared
  // logic; the operator dispatches a pre-built prompt to the LLM here.

  /**
   * Operator dispatches a single non-streaming LLM call. Used by webhook
   * routes (Telegram, WhatsApp) and the action API (public-crud) where
   * there is no streaming UX.
   *
   * The operator owns:
   *   - the choice of model (caller passes; operator could later choose)
   *   - the conversation history (operator's memory of the turn)
   *   - the system prompt content (operator identity + scope context)
   *
   * The LLM owns: text generation in the operator's voice.
   */
  async executeSync(
    messages: ChatMessage[],
    opts: ChatOptions = {},
  ): Promise<CompletionResult> {
    return await chatCompletion(messages, opts);
  }

  /**
   * Operator dispatches a streaming LLM call. Used by Hub UI (chat.ts)
   * and public-chat (slot deployments) where the user sees the operator's
   * reply unfold in real time.
   *
   * The caller iterates the returned async generator. Each chunk carries
   * either a text delta (operator's voice as it forms) or a final-chunk
   * with toolCall + usage. The route remains responsible for tool
   * execution (because tools touch route-specific state — DB writes,
   * file persistence, SSE event emission). The OPERATOR remains
   * responsible for the LLM dispatch itself: this method is the operator's
   * way of asking the LLM to compute.
   *
   * Note: extracting the full tool-loop iteration into the agent is
   * deferred to Step 2.5. Tonight's Step 2 establishes the operator-as-
   * dispatcher pattern without restructuring the loop machinery, which
   * touches ~500 lines and risks regression.
   */
  executeStreaming(
    messages: ChatMessage[],
    opts: ChatOptions = {},
  ): AsyncGenerator<StreamChunk> {
    return streamChat(messages, opts);
  }
}
