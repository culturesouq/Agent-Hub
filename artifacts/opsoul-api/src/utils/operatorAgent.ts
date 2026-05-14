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

export type AnalyseDecision =
  | { kind: 'execute' }
  | { kind: 'refuse_architecture' };

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
   * STEP 1 — Operator analyses the user message.
   *
   * The operator inspects the incoming message and decides what should
   * happen this turn BEFORE any LLM is called.
   *
   * Today's outcomes:
   *   execute              — operator dispatches the LLM as executor
   *   refuse_architecture  — operator handles the refusal directly, in
   *                          its own voice, with no LLM call
   *
   * Returning refuse_architecture saves the LLM call, eliminates the
   * leak risk on the source, and gives a consistent natural reply.
   * Output firewall (validate() below) remains as the structural backstop
   * for any draft the LLM produces that still quotes internals.
   *
   * Birth-mode operators are exempt from architecture-question refusal
   * because the newborn must be able to engage with identity questions
   * while its identity is being formed.
   */
  analyse(userMessage: string): AnalyseDecision {
    if (this.init.isBirthMode) return { kind: 'execute' };
    if (isArchitectureQuestion(userMessage)) return { kind: 'refuse_architecture' };
    return { kind: 'execute' };
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
}
