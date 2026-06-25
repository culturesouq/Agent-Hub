/**
 * Operator-collaborative firewall (Claim 5)
 *
 * Phase 1A patent commits to two surfaces:
 *
 *   5(a) Input tagger — examines the inbound user message BEFORE the
 *        operator's loop runs, attaches a structured `safety_context`
 *        describing risks the operator should be aware of (jailbreak
 *        attempt, exfil request, PII flood, etc.). The operator itself
 *        decides how to respond — the firewall is collaborative, not
 *        a hard gate. Operator voice is preserved.
 *
 *   5(b) Output leak-check — examines the operator's drafted reply BEFORE
 *        it streams back to the user. Attaches a structured `leak_feedback`
 *        describing any policy concerns (architecture-name leak, PII echo,
 *        wrong-tone-for-archetype, etc.) so the operator can iterate.
 *
 * Phase 4 will plug actual logic into these two functions. Phase 2B ships
 * the SURFACE — the callable functions, the integration points at every
 * chat / public-chat / webhook entry, and the metadata-propagation
 * convention — so the architecture surface matches the patent claim
 * TODAY even though the implementation is a no-op. This is honest: the
 * claim says "these surfaces exist", and they do (callable, integrated,
 * type-checked, returning null until Phase 4 fills them in).
 *
 * Both functions return null today (no-op). When non-null, the result is
 * attached to the operator's tool context as `safetyContext` / `leakFeedback`
 * (see operatorToolset.ts) so the operator's reasoning loop can see it.
 *
 * Per [[no-fallbacks]] and the standing patent direction: these analyzers
 * NEVER substitute the operator's reply with synthetic content. They only
 * annotate. The operator always ships its own reply or the caller gets a
 * structured error.
 */

/** Reason codes for input-side safety context. Phase 4 will extend. */
export type SafetyRisk =
  | 'jailbreak_attempt'
  | 'prompt_injection'
  | 'exfil_request'
  | 'pii_flood'
  | 'policy_test'
  | 'role_confusion';

export interface SafetyContext {
  /** Highest-severity risk detected. */
  risk: SafetyRisk;
  /** 0-1 confidence the risk is real. */
  confidence: number;
  /** Free-text description for the operator's reasoning loop. */
  rationale: string;
  /** Whether the operator SHOULD respond (true) or refuse via its own voice (false). */
  shouldRespond: boolean;
}

/** Reason codes for output-side leak feedback. Phase 4 will extend. */
export type LeakKind =
  | 'architecture_name_leak'
  | 'pii_echo'
  | 'memory_overshare'
  | 'tone_mismatch'
  | 'capability_overclaim'
  | 'identity_drift';

export interface LeakFeedback {
  kind: LeakKind;
  /** Excerpt of the draft reply that triggered the feedback. */
  excerpt: string;
  /** Suggested correction for the operator's next draft. */
  suggestion: string;
  /** Whether the draft is safe to ship as-is. */
  safeToShip: boolean;
}

/**
 * 5(a) Input tagger. Stub — returns null. Phase 4 will replace with the
 * real analyzer (LLM-driven classification + heuristic backstops). Call
 * sites must still invoke this so Phase 4 light-up is wire-and-go.
 *
 * @param _message — raw user input as a string. Multipart payloads are
 *                  flattened by the caller to plain text first.
 */
export function analyzeInputForSafety(_message: string): SafetyContext | null {
  // Phase 4 implementation lands here. Until then this is a no-op surface
  // so the call sites can be wired today without changing operator behavior.
  return null;
}

/**
 * 5(b) Output leak-check. Stub — returns null. Phase 4 will replace with
 * the real analyzer (architecture-name regex + PII regex + tone-vs-archetype
 * model). Call sites must still invoke this so Phase 4 light-up is wire-
 * and-go.
 *
 * @param _content      — operator's drafted reply.
 * @param _operatorId   — operator id, for fetching archetype + identity context.
 */
export function analyzeOutputForLeak(
  _content: string,
  _operatorId: string,
): LeakFeedback | null {
  // Phase 4 implementation lands here. Until then this is a no-op surface.
  return null;
}
