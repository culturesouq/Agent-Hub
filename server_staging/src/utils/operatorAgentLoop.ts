/**
 * Shared sync agent loop (Phase 1B / D-4).
 *
 * Mirrors the simpler MAX_ITER block in `chat.ts:865-965` for non-streaming
 * surfaces (public-chat sync path, public-crud action API, telegram-webhook,
 * whatsapp-webhook). The streaming path in chat.ts stays bespoke because of
 * its SSE event emission machinery — extracting it would mean carrying the
 * res-write callback through the helper, which couples the helper to the
 * Express response object. Out of scope here.
 *
 * 2026-06-02 — Operator-as-driver everywhere (TurnPlan integration).
 *
 *   - For `kind === 'introspect'`: single LLM call, NO tools, the operator's
 *     deterministic agency content is prepended to the message stream as a
 *     system-priority block. LLM voices the operator's content; cannot
 *     fabricate tools.
 *   - For `kind === 'chat'`: single LLM call, NO tools, operator's chat
 *     scaffolding (intent + constraints) prepended to message stream. LLM
 *     stays inside operator's intent.
 *   - For `kind === 'execute'`: full iteration loop, tools authorised,
 *     operator's execute scaffolding prepended.
 *
 * In ALL cases, the operator's TurnPlan is the authoritative driver. The LLM
 * is the voice engine constrained by the plan's intent/constraints — never
 * a freeform author. Per Claim 21 fully realised.
 *
 * Loop semantics (execute mode only):
 *   - Up to MAX_ITER tool calls per turn (default 8).
 *   - Up to MAX_SEARCHES web_search calls per turn (default 5) — once hit,
 *     web_search is filtered out of the offered tool set so the LLM cannot
 *     keep searching in a loop.
 *   - Each iteration dispatches one tool call (if the LLM emitted one),
 *     pushes the assistant + tool result back into the loop, and continues.
 *   - When the LLM produces a clean response with no tool call, the loop
 *     terminates and returns the final content.
 *   - Per [[no-fallbacks]]: on terminateLoop hint from a tool handler,
 *     return whatever the model produced before the failed call — never
 *     substitute synthetic content.
 *
 * Patent claims 4 / 9 / 31 / 36 require the universal tool substrate to
 * apply to "every inbound request"; this helper is the substrate carrier
 * for surfaces that don't have their own bespoke agent loop.
 */

import { dispatchViaSdk } from './sdkToolBridge.js';
import { renderTurnPlanSystemContext, type OperatorAgent, type TurnPlan } from './operatorAgent.js';
import type { ChatMessage, ToolDefinition } from './openrouter.js';
import type { OperatorToolset } from './operatorToolset.js';

export interface RunSyncAgentLoopOptions {
  agent: OperatorAgent;
  toolset: OperatorToolset;
  messages: ChatMessage[];
  model: string;
  /**
   * The operator's TurnPlan for this turn. When present, drives the loop's
   * mode (introspect / chat / execute), prepends operator scaffolding to the
   * message stream, and authorises tools only when plan.toolsAuthorised.
   * Preferred over `analyseDecision` for new callers.
   */
  turnPlan?: TurnPlan;
  /**
   * Legacy: operator's analyse() decision when TurnPlan is not yet wired
   * by the caller. 'execute' offers tools; 'chat' / 'introspect' don't.
   * Ignored when turnPlan is provided. Widened to include 'introspect'
   * for v2 — caller can pass decision.kind directly without narrowing.
   */
  analyseDecision?: 'execute' | 'chat' | 'introspect';
  /** Override the default MAX_ITER cap. */
  maxIterations?: number;
  /** Override the default MAX_SEARCHES cap. */
  maxSearches?: number;
}

export interface AgentLoopResult {
  /** Final operator-voice content the LLM produced when the loop terminated. */
  content: string;
  /** Number of tool calls executed across all iterations. */
  toolCallsExecuted: number;
  /** Number of web_search calls executed (also counted in toolCallsExecuted). */
  webSearchCount: number;
  /** Tokens consumed across all iterations. */
  promptTokens: number;
  completionTokens: number;
  /** True if the loop terminated via MAX_ITER rather than a clean response. */
  iterationCapHit: boolean;
}

const DEFAULT_MAX_ITER = 8;
const DEFAULT_MAX_SEARCHES = 5;

/**
 * Prepend the operator's TurnPlan to the LLM's message stream as a high-
 * priority system block. Inserted AFTER any pre-existing system messages so
 * it sits closest to the user message — i.e. the operator's TurnPlan is the
 * last thing the LLM reads before composing its reply.
 */
function injectTurnPlan(messages: ChatMessage[], plan: TurnPlan): ChatMessage[] {
  const ctx = renderTurnPlanSystemContext(plan);
  // Find the index just after the trailing system block. We insert right
  // before the first non-system message so the operator's plan sits with
  // the other system context (operator identity, etc.).
  let firstNonSystem = messages.findIndex(m => m.role !== 'system');
  if (firstNonSystem < 0) firstNonSystem = messages.length;
  return [
    ...messages.slice(0, firstNonSystem),
    { role: 'system', content: ctx },
    ...messages.slice(firstNonSystem),
  ];
}

export async function runSyncAgentLoop(opts: RunSyncAgentLoopOptions): Promise<AgentLoopResult> {
  const { agent, toolset, messages, model, turnPlan } = opts;
  const maxIter = opts.maxIterations ?? DEFAULT_MAX_ITER;
  const maxSearches = opts.maxSearches ?? DEFAULT_MAX_SEARCHES;

  // Resolve effective mode: TurnPlan wins if provided; else legacy decision;
  // else default to 'execute' for backward compatibility.
  const legacy = opts.analyseDecision ?? 'execute';
  const mode: 'execute' | 'chat' | 'introspect' = turnPlan
    ? turnPlan.kind
    : legacy;

  // If we have a TurnPlan, inject the operator's authoring scaffolding into
  // the LLM message stream so the LLM sees the operator's intent + scaffolding
  // + constraints. Without a TurnPlan we run on legacy behaviour (no inject).
  const effectiveMessages: ChatMessage[] = turnPlan
    ? injectTurnPlan(messages, turnPlan)
    : [...messages];

  // ── INTROSPECT (operator-authored content; LLM voices it; NO tools) ───
  if (mode === 'introspect') {
    const result = await agent.executeSync(effectiveMessages, { model, tools: undefined });
    return {
      content: result.content,
      toolCallsExecuted: 0,
      webSearchCount: 0,
      promptTokens: result.promptTokens ?? 0,
      completionTokens: result.completionTokens ?? 0,
      iterationCapHit: false,
    };
  }

  // ── CHAT (conversational reply, NO tools) ───────────────────────────────
  if (mode === 'chat') {
    const result = await agent.executeSync(effectiveMessages, { model, tools: undefined });
    return {
      content: result.content,
      toolCallsExecuted: 0,
      webSearchCount: 0,
      promptTokens: result.promptTokens ?? 0,
      completionTokens: result.completionTokens ?? 0,
      iterationCapHit: false,
    };
  }

  // ── EXECUTE (tools authorised, full iteration loop) ─────────────────────
  const loopMessages: ChatMessage[] = [...effectiveMessages];
  let finalContent = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let toolCallsExecuted = 0;
  let webSearchCount = 0;
  let iterationCapHit = false;

  for (let iter = 0; iter < maxIter; iter++) {
    // Filter web_search out of the offered tool set once the per-turn cap
    // is hit — same logic as chat.ts streaming path.
    const iterTools: ToolDefinition[] = webSearchCount >= maxSearches
      ? toolset.tools.filter(t => t.function.name !== 'web_search')
      : toolset.tools;

    const result = await agent.executeSync(loopMessages, {
      model,
      tools: iterTools.length > 0 ? iterTools : undefined,
    });

    promptTokens += result.promptTokens ?? 0;
    completionTokens += result.completionTokens ?? 0;

    if (!result.toolCall) {
      finalContent = result.content;
      break;
    }

    // Dispatch the tool call. The handler's `meta` carries loop-control
    // signals (webSearchFired, terminateLoop). No SSE progress callback —
    // this is the sync path; handlers fall back to their no-event path.
    const dispatchResult = await dispatchViaSdk(
      result.toolCall.name,
      result.toolCall.args,
      toolset.toolHandlerCtx,
      { operatorName: '', liveSecrets: [], connectedIntegrations: [] },
    );

    toolCallsExecuted++;
    if (dispatchResult.meta?.webSearchFired) webSearchCount++;

    if (dispatchResult.meta?.terminateLoop) {
      // Per [[no-fallbacks]]: return whatever the LLM said before the
      // failed call. Never substitute synthetic content. The tool's
      // returned content is structured-error data the caller can surface.
      finalContent = result.content;
      break;
    }

    // Push assistant turn + tool result back into the loop so the model
    // sees the result and decides next step.
    loopMessages.push(
      {
        role: 'assistant',
        content: result.content || '',
        tool_calls: [{
          id: result.toolCall.id,
          type: 'function',
          function: { name: result.toolCall.name, arguments: result.toolCall.args },
        }],
      },
      {
        role: 'tool',
        content: dispatchResult.content,
        tool_call_id: result.toolCall.id,
      },
    );

    if (iter === maxIter - 1) {
      iterationCapHit = true;
      // The model never produced a tool-free reply within the iteration
      // cap. Fall back to the last partial content. Per [[no-fallbacks]]
      // we do not substitute synthetic content — caller sees an empty
      // string if the model never produced any.
      finalContent = result.content;
    }
  }

  return {
    content: finalContent,
    toolCallsExecuted,
    webSearchCount,
    promptTokens,
    completionTokens,
    iterationCapHit,
  };
}
