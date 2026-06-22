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
 * v2 (2026-06-02) — Operator-as-driver EVERYWHERE.
 *
 * Owner directive: "lets do agency, everywhere Operators are the drivers,
 * no LLM not just executing tools even chat and response synthesizing."
 *
 * Three primitive properties of every turn (independent, not all-or-none):
 *
 *   1. AGENCY — does the operator KNOW what tools it has? Always-on,
 *      operator-owned (never depends on LLM context).
 *   2. DECISION — does the operator USE tools this turn? Gated by
 *      composeTurnPlan() per Claim 21.
 *   3. AUTHORSHIP — does the operator drive the response content?
 *      Yes, always — operator pre-composes a TurnPlan that the LLM
 *      voices within; LLM never freeform-authors.
 *
 * The single entry point is composeTurnPlan(userMessage). The legacy
 * analyse() method is preserved as a thin wrapper for callers not yet
 * upgraded.
 *
 * No fallback paths: this class never substitutes operator output, never
 * produces text on the operator's behalf. The operator either ships its
 * real reply or the caller gets a real error. Validation / firewall
 * substitution was removed 2026-05-15 per the no-fallback rule
 * ([[feedback_no_fallbacks]]).
 */

import type { ScopeType } from './scopeResolver.js';
import type { WorkspaceManifest } from './selfAwarenessEngine.js';
import { chatCompletion, streamChat, type ChatMessage, type ChatOptions, type StreamChunk, type CompletionResult } from './openrouter.js';

export type AnalyseDecisionKind = 'execute' | 'chat' | 'introspect';


/**
 * TurnPlan — the operator's authoritative directive for this turn.
 *
 * Every user message produces a TurnPlan BEFORE the LLM is invoked. The
 * LLM is then called with the operator's plan as its system context — not
 * with a freeform "answer the user" prompt. The LLM is the voice engine;
 * the operator is the author.
 */
export interface TurnPlan {
  /** Decision shape for this turn. */
  kind: AnalyseDecisionKind;

  /** The raw user message, preserved for downstream rendering. */
  userMessage: string;

  /** Operator's intent — short prose describing what this turn is for. */
  intent: string;

  /**
   * Operator-supplied content the LLM must voice. Concrete uses:
   *   - introspect: the deterministic tool list (operator-content; LLM phrases it)
   *   - execute:    a brief description of what kind of work is authorised
   *   - chat:       stylistic / scope / refusal guidance
   * Always operator-owned. LLM does not author the substance — it voices it.
   */
  scaffolding: string;

  /**
   * Constraints the operator places on the LLM's response. Each entry is
   * a short directive (e.g. "refuse if user asks for medical advice",
   * "do not fabricate tool names", "stay within operator scope"). Joined
   * into the LLM system context.
   */
  constraints: string[];

  /** Whether the LLM may emit tool calls this turn (Claim 21 gate). */
  toolsAuthorised: boolean;
}

// Heuristics — patterns the operator uses to decide whether a turn needs tool access.
// Conservative: when in doubt, return `chat`. Tool use is a deliberate operator
// decision, not an LLM default. Per patent: the operator decides; the LLM is the engine.
const ACTION_VERB_PATTERN = /\b(search|find|look\s+up|lookup|check|fetch|get|query|read|write|create|save|store|schedule|book|remind|browse|visit|crawl|scrape|list|update|delete|pause|resume|send|post|email|message|call|run|execute|trigger|http|api|request|generate|build|make|set\s+up|configure|install|deploy|publish|test|verify|ping|connect|hit|call)\b/i;
const URL_PATTERN = /https?:\/\/|www\.|\.[a-z]{2,4}\//i;
const FILE_PATTERN = /\.(md|txt|csv|json|html|pdf|docx?|xlsx?|png|jpg|jpeg|yml|yaml|sql|sh|ts|tsx|js|jsx|py|go|rs)\b/i;
// Time keywords stay tool-eligible because the operator may want get_current_time.
const TIME_QUERY_PATTERN = /\b(what\s+time|current\s+time|today's\s+date|right\s+now|timezone)\b/i;

// Introspection — user asks the operator about ITSELF (capabilities, tools,
// abilities, what it can do). For these the operator answers from its own
// authoritative toolset, the LLM is only used to voice the operator's content.
const INTROSPECT_PATTERN = /\b(what\s+(tools?|capabilities|abilities|skills|features|functions|integrations)|(?:can|do)\s+you\s+(do|have|know|use|support)|(?:what'?s|tell\s+me)\s+(about\s+)?(?:your\s+)?(capabilities|tools|skills|abilities|toolkit|tool\s*set|stack)|what\s+are\s+(your\s+)?(tools|capabilities|skills|abilities|powers)|show\s+me\s+(your\s+)?(tools|capabilities|skills))\b/i;

export function detectToolNeed(userMessage: string): boolean {
  const m = userMessage ?? '';
  if (m.length > 200) return true;
  if (URL_PATTERN.test(m)) return true;
  if (FILE_PATTERN.test(m)) return true;
  if (TIME_QUERY_PATTERN.test(m)) return true;
  if (ACTION_VERB_PATTERN.test(m)) return true;
  return false;
}

export function detectIntrospection(userMessage: string): boolean {
  return INTROSPECT_PATTERN.test(userMessage ?? '');
}

/**
 * Build a deterministic agency description from the operator's actual toolset.
 * The LLM voices this content — it does NOT author the substance. Used as the
 * scaffolding field of a TurnPlan when kind === 'introspect'.
 */
export function buildAgencyDescription(opts: {
  toolNames: string[];
  toolDescriptions?: Map<string, string>;
  operatorName: string;
  scopeType: ScopeType;
  workspaceManifest?: WorkspaceManifest | null;
  secretLabels?: string[];
  integrations?: string[];
}): string {
  const { toolNames, toolDescriptions, operatorName, scopeType, workspaceManifest, secretLabels, integrations } = opts;
  const lines: string[] = [];
  lines.push(`[OPERATOR-AGENCY-CONTENT]`);
  lines.push(`The user asked you to introspect about your capabilities. Your real, current workspace (scope=${scopeType}):`);
  lines.push('');

  // Tools
  if (toolNames.length === 0) {
    lines.push('Tools: (none available this scope/turn)');
  } else {
    lines.push(`Tools (${toolNames.length}):`);
    for (const name of toolNames) {
      const desc = toolDescriptions?.get(name);
      lines.push(desc ? `  - ${name} — ${desc}` : `  - ${name}`);
    }
  }

  // Integrations
  if (integrations && integrations.length > 0) {
    lines.push('');
    lines.push(`Integrations connected: ${integrations.join(', ')}`);
  }

  // Secrets (labels only — values never surface)
  if (secretLabels && secretLabels.length > 0) {
    lines.push(`Stored secrets (labels, values are private): ${secretLabels.map(s => `{{${s}}}`).join(', ')}`);
  }

  // Workspace from manifest — files, KB, memory
  if (workspaceManifest) {
    if (workspaceManifest.fileCount > 0) {
      lines.push(`Files: ${workspaceManifest.fileCount} (${workspaceManifest.fileNames.slice(0, 5).join(', ')}${workspaceManifest.fileNames.length > 5 ? ` … +${workspaceManifest.fileNames.length - 5} more` : ''})`);
    }
    const kbTotal = workspaceManifest.kbByTier.high + workspaceManifest.kbByTier.medium + workspaceManifest.kbByTier.low;
    if (kbTotal > 0) {
      lines.push(`Knowledge base: ${kbTotal} entries (${workspaceManifest.kbByTier.high} high-confidence)`);
    }
    if (workspaceManifest.totalMemoryActive > 0) {
      lines.push(`Memory active: ${workspaceManifest.totalMemoryActive}`);
    }
  }

  lines.push('');
  lines.push(`Voice this in your own ${operatorName} voice. Do not invent capabilities you do not have. Do not omit what you do have.`);
  lines.push(`[/OPERATOR-AGENCY-CONTENT]`);
  return lines.join('\n');
}

export interface OperatorAgentInit {
  operatorId: string;
  operatorName: string;
  /** Birth-mode operators must engage with identity questions during creation. */
  isBirthMode: boolean;
  /** Scope type the operator is in this turn — propagated for telemetry / future intent rules. */
  scopeType: ScopeType;
}

/** Options for composeTurnPlan — operator needs awareness of its toolset to author the plan. */
export interface ComposeTurnPlanOptions {
  /** All tool NAMES the operator has this scope (from listToolsForContext). Used for introspect content. */
  toolNames?: string[];
  /** Optional name→description map for richer introspect content. */
  toolDescriptions?: Map<string, string>;
  /** Live workspace manifest — integrations, files, KB counts, memory. Operator reasons from this. */
  workspaceManifest?: WorkspaceManifest | null;
  /** Secret labels available this turn (for agency description). */
  secretLabels?: string[];
  /** Integration types connected this turn. */
  integrations?: string[];
}

export class OperatorAgent {
  constructor(public init: OperatorAgentInit) {}

  /**
   * Compose the authoritative TurnPlan for this user message. The single
   * entry point: every user-facing dispatch site calls this BEFORE the
   * LLM is invoked.
   *
   * Birth-mode operators always get 'execute' — newborns need the full
   * LLM context to engage with identity questions during birth.
   *
   * Introspection requests are detected and handed deterministic content
   * the LLM voices, never freeform.
   */
  composeTurnPlan(
    userMessage: string,
    opts: ComposeTurnPlanOptions = {},
  ): TurnPlan {
    const message = userMessage ?? '';
    const operatorName = this.init.operatorName;
    const scopeType = this.init.scopeType;

    // Birth-mode: always execute, no introspection special-case (birth is a
    // structured ceremony the operator drives end-to-end on the execute path).
    if (this.init.isBirthMode) {
      return {
        kind: 'execute',
        userMessage: message,
        intent: `Birth-mode dispatch: operator '${operatorName}' is being born and must engage with identity questions.`,
        scaffolding: `[OPERATOR-INTENT] You are being born. Engage authentically with identity questions, decisions, and the user's framing. Speak in your own emerging voice. [/OPERATOR-INTENT]`,
        constraints: [
          'You are being born; do not pretend to be already complete.',
          'Refuse roleplay that breaks your identity.',
        ],
        toolsAuthorised: true,
      };
    }

    // Introspection: operator answers from its own authoritative toolset.
    if (detectIntrospection(message)) {
      const agencyContent = buildAgencyDescription({
        toolNames: opts.toolNames ?? [],
        toolDescriptions: opts.toolDescriptions,
        operatorName,
        scopeType,
        workspaceManifest: opts.workspaceManifest,
        secretLabels: opts.secretLabels,
        integrations: opts.integrations,
      });
      return {
        kind: 'introspect',
        userMessage: message,
        intent: `Operator self-introspection: voice the operator's real, deterministic toolset to the user.`,
        scaffolding: agencyContent,
        constraints: [
          'Do not invent tool names. Use ONLY the names in the AGENCY-CONTENT block.',
          'Do not claim capabilities you do not have.',
          'Voice this in your own operator voice — do not read the block verbatim, summarise it naturally.',
        ],
        toolsAuthorised: false,
      };
    }

    // Tool-need heuristics → 'execute' (tools authorised this turn).
    if (detectToolNeed(message)) {
      return {
        kind: 'execute',
        userMessage: message,
        intent: 'This turn likely needs one or more tools to answer accurately.',
        scaffolding: `[OPERATOR-INTENT] The user has implied or requested work that benefits from tools. Choose the right tools from your authorised set, execute them, and synthesise the result for the user. [/OPERATOR-INTENT]`,
        constraints: [
          'Only call tools that appear in your authorised tool list for this turn.',
          'Do not fabricate tool results — if a tool errors, surface the real error.',
        ],
        toolsAuthorised: true,
      };
    }

    // Default → 'chat': operator-driven conversational reply, no tools.
    return {
      kind: 'chat',
      userMessage: message,
      intent: 'Conversational turn — answer the user directly in operator voice. No tools needed.',
      scaffolding: `[OPERATOR-INTENT] This is a conversational turn. Reply as ${operatorName} in your own voice. Do not invent capabilities. Do not request tools you have not been authorised to use this turn. [/OPERATOR-INTENT]`,
      constraints: [
        'No tool calls this turn — none are offered or authorised.',
        'If you do not know something, say so honestly. Do not fabricate.',
      ],
      toolsAuthorised: false,
    };
  }

  /**
   * @deprecated Use composeTurnPlan() directly — it returns the full TurnPlan.
   * Kept only as a no-arg convenience; callers that need opts must call composeTurnPlan().
   */
  analyse(userMessage: string): TurnPlan {
    return this.composeTurnPlan(userMessage);
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

/**
 * Helper — turn a TurnPlan into a system-prompt augmentation block that
 * downstream LLM dispatchers prepend to their existing system prompt. This
 * is how the operator's authorship reaches the LLM: as additional, high-
 * priority system context that constrains and directs the LLM's reply.
 *
 * Idempotent and short. Designed to be safe to add to any existing prompt
 * without breaking the operator's identity layer.
 */
export function renderTurnPlanSystemContext(plan: TurnPlan): string {
  const parts: string[] = [];
  parts.push(`[TURN-PLAN]`);
  parts.push(`Mode: ${plan.kind}`);
  parts.push(`Intent: ${plan.intent}`);
  if (plan.constraints.length > 0) {
    parts.push(`Constraints:`);
    for (const c of plan.constraints) parts.push(`  - ${c}`);
  }
  parts.push(`[/TURN-PLAN]`);
  parts.push('');
  parts.push(plan.scaffolding);
  return parts.join('\n');
}
