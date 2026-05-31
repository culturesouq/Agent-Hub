/**
 * Multi-provider LLM client — routes every chat completion through the
 * model registry so OpSoul can drive any LLM behind any SDK.
 *
 * Public API (stable — chat.ts, mcpServer.ts, etc. don't change):
 *   - streamChat(messages, opts) - AsyncGenerator of streaming chunks
 *   - chatCompletion(messages, opts) - non-streaming result
 *   - CHAT_MODEL / KB_MODEL / AUTO_MODEL - default model ids
 *   - MODEL_OPTIONS - frontend picker payload
 *
 * Internal: getClientForModel(modelId, apiKey?) consults modelRegistry to
 * pick the baseURL + API key + adapter for each call. Today all supported
 * providers are OpenAI-compatible (OpenRouter, Hajeri RunPod, OpenAI, etc.)
 * so a single OpenAI SDK client handles them all with different baseURLs.
 * The 'adapter' field on ProviderConfig is the seam for non-OpenAI-compat
 * providers (Anthropic Messages API, Google Gemini) when their adapter
 * modules are added later.
 *
 * Filename is historical ('openrouter.ts'). The module is now multi-
 * provider; OpenRouter is just one of many. A future commit can rename to
 * llmClient.ts or modelClient.ts — touches every importer.
 */

import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk, ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/index.js';
import {
  resolveModel,
  resolveApiKey,
  listAvailableModels,
  DEFAULT_MODEL_ID,
  type ProviderConfig,
} from './modelRegistry.js';

// ───────────────────────────────────────────────────────────────────────────
//  PUBLIC API (stable — do not change export shapes without auditing callers)
// ───────────────────────────────────────────────────────────────────────────

/** Default model when an operator has no defaultModel set. */
export const CHAT_MODEL = DEFAULT_MODEL_ID;
/** Model used for KB intake distillation. */
export const KB_MODEL = DEFAULT_MODEL_ID;
/** Sentinel model that means "let OpSoul pick per-turn". */
export const AUTO_MODEL = 'opsoul/auto';

/** Frontend model picker payload — sourced from the registry. */
export const MODEL_OPTIONS = listAvailableModels().map((m) => ({
  id: m.id,
  label: m.label,
  description: m.description,
}));

const MAX_TOKENS = 8192;

// ───────────────────────────────────────────────────────────────────────────
//  RETRY + BUDGET (Claim 21 — bounded exponential backoff, per-turn budget)
// ───────────────────────────────────────────────────────────────────────────
//
// Chat-path LLM invocations now retry transient upstream failures with a
// bounded exponential backoff before surfacing the error to the caller.
// On final exhaustion the original error is re-thrown verbatim — per
// [[no-fallbacks]] the caller (chat / public-chat / webhook routes) decides
// how to surface it, never the LLM client. No synthetic content is ever
// substituted at this layer.
//
// Per-request token budget is enforced separately as a precondition check —
// estimated message tokens plus requested max_tokens must fit under the
// configured CHAT_LLM_BUDGET_TOKENS ceiling, defaulting to 4096 input +
// 2048 output = 6144 total. Exceeding the budget throws an LlmBudgetError
// before the LLM is contacted, so runaway-context turns cannot silently
// burn provider quota.
//
// GROW has its own retry on a completely different timescale (hours, DB-
// persisted via growProposalsTable.retryCount + RETRY_DELAY_HOURS) — see
// growEngine.ts retryPendingProposals(). That mechanism handles malformed
// proposal JSON across days; this one handles transient HTTP/network blips
// inside a single chat turn. Keeping them separate is intentional — they
// solve orthogonal problems.

/** Maximum retry attempts for transient LLM failures within one chat turn. */
const LLM_MAX_RETRIES = Number.parseInt(process.env.CHAT_LLM_MAX_RETRIES ?? '3', 10);
/** Delays between retries (ms). Length must be >= LLM_MAX_RETRIES. */
const LLM_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
/**
 * Per-request token budget — input estimate cap and output ceiling.
 *
 * Phase 2B decision (2026-05-31): defaults raised from the original Phase 1B
 * spec (4096/2048) to match the existing 60k history window in chat.ts
 * (HISTORY_MAX_TOKENS = 60_000). The original tight defaults were a
 * placeholder pending owner review — they would have failed any long-history
 * turn with LlmBudgetError before contacting the LLM at all, which is worse
 * than no budget at all (it would silently kill normal chat).
 *
 * New defaults:
 *   - Input:  65_536 tokens (one rounded power-of-two above HISTORY_MAX_TOKENS,
 *             room for system prompt + KB + memory + tool catalog on top of
 *             the 60k history window).
 *   - Output: 4096 tokens (reasonable assistant turn ceiling; long-form
 *             responses past this size are rare and usually indicate a
 *             prompt-engineering issue, not a real need).
 *
 * Both stay overridable via env (CHAT_LLM_BUDGET_TOKENS / CHAT_LLM_OUTPUT_TOKENS)
 * so deployments running on cheap-tier models with smaller real ceilings can
 * tighten them, and deployments on Claude 4.7 1M can loosen them. The
 * mechanism stays the same — only the defaults moved to match reality.
 */
const LLM_BUDGET_INPUT_TOKENS = Number.parseInt(process.env.CHAT_LLM_BUDGET_TOKENS ?? '65536', 10);
const LLM_BUDGET_OUTPUT_TOKENS = Number.parseInt(process.env.CHAT_LLM_OUTPUT_TOKENS ?? '4096', 10);

export class LlmBudgetError extends Error {
  readonly code = 'llm_budget_exceeded';
  readonly estimatedInputTokens: number;
  readonly outputTokens: number;
  readonly budgetInputTokens: number;
  readonly budgetOutputTokens: number;
  constructor(estimatedInputTokens: number, outputTokens: number) {
    super(`Per-turn LLM token budget exceeded — estimated input ${estimatedInputTokens} + output ${outputTokens} > budget ${LLM_BUDGET_INPUT_TOKENS} + ${LLM_BUDGET_OUTPUT_TOKENS}`);
    this.estimatedInputTokens = estimatedInputTokens;
    this.outputTokens = outputTokens;
    this.budgetInputTokens = LLM_BUDGET_INPUT_TOKENS;
    this.budgetOutputTokens = LLM_BUDGET_OUTPUT_TOKENS;
  }
}

function estimateInputTokens(messages: ChatMessage[]): number {
  // Rough char/4 estimate — same heuristic chat.ts uses for the history cap.
  // Good enough for budget gating; the real count comes back from the API.
  let chars = 0;
  for (const m of messages) {
    const content = m.content;
    if (typeof content === 'string') {
      chars += content.length;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'text') chars += part.text.length;
        else if (part.type === 'image_url') chars += 1024; // conservative image budget
      }
    }
  }
  return Math.ceil(chars / 4);
}

function enforceBudget(messages: ChatMessage[], requestedOutputTokens: number): void {
  const inputEstimate = estimateInputTokens(messages);
  if (inputEstimate > LLM_BUDGET_INPUT_TOKENS || requestedOutputTokens > LLM_BUDGET_OUTPUT_TOKENS) {
    throw new LlmBudgetError(inputEstimate, requestedOutputTokens);
  }
}

function isRetryableError(err: unknown): boolean {
  const e = err as { status?: number; code?: string; name?: string } | null;
  if (!e) return false;
  const status = typeof e.status === 'number' ? e.status : null;
  // Retry: 5xx upstream errors, 408 timeout, 429 rate limit
  if (status !== null) {
    if (status >= 500) return true;
    if (status === 408 || status === 429) return true;
    return false; // any other 4xx is a client error — do not retry
  }
  // Network-level errors
  const code = e.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN') return true;
  // Fetch/undici aborts that AREN'T budget exhaustion
  if (e.name === 'AbortError') return true;
  return false;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableError(err);
      if (!retryable || attempt === LLM_MAX_RETRIES) {
        if (retryable) {
          console.error(`[openrouter] ${label} — retry budget exhausted after ${LLM_MAX_RETRIES} attempts`, err);
        }
        throw err;
      }
      const delay = LLM_RETRY_DELAYS_MS[attempt] ?? LLM_RETRY_DELAYS_MS[LLM_RETRY_DELAYS_MS.length - 1];
      console.warn(`[openrouter] ${label} — transient failure, retrying in ${delay}ms (attempt ${attempt + 1}/${LLM_MAX_RETRIES})`, { status: (err as { status?: number })?.status, code: (err as { code?: string })?.code });
      await sleep(delay);
    }
  }
  // Unreachable — loop either returns or throws
  throw lastErr;
}

// ───────────────────────────────────────────────────────────────────────────
//  INTERNAL — provider-routed client builder
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cache of OpenAI SDK clients keyed by `${baseURL}::${apiKey}` so we don't
 * spin up a new client for every request. Important for connection reuse.
 */
const clientCache = new Map<string, OpenAI>();

function buildClient(config: ProviderConfig, apiKey: string): OpenAI {
  const cacheKey = `${config.baseURL}::${apiKey}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;
  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: apiKey || 'unused',
    defaultHeaders: {
      'HTTP-Referer': 'https://opsoul.ai',
      'X-Title': 'OpSoul v2.4',
    },
  });
  clientCache.set(cacheKey, client);
  return client;
}

/**
 * Resolves a model id + optional per-operator API key into a ready-to-use
 * OpenAI-compatible client + the model name to send.
 *
 * Returned `sendAs` may differ from the operator-facing modelId — e.g.
 * OpenAI provider strips the 'openai/' prefix because the OpenAI API
 * expects bare 'gpt-5', not 'openai/gpt-5'.
 */
function getClientForModel(
  modelId: string,
  apiKeyOverride?: string | null,
): { client: OpenAI; sendAs: string; config: ProviderConfig } {
  const { config, sendAs } = resolveModel(modelId);
  const apiKey = resolveApiKey(config, apiKeyOverride);
  const client = buildClient(config, apiKey);
  return { client, sendAs, config };
}

// ───────────────────────────────────────────────────────────────────────────
//  SHARED TYPES (stable — these are public)
// ───────────────────────────────────────────────────────────────────────────

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type ChatMessage =
  | { role: 'system'; content: string | ContentPart[] }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | ContentPart[]; tool_calls?: AssistantToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export interface AssistantToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
        additionalProperties?: unknown;
        /** For type:'array' params. JSON-Schema-shaped recursive item descriptor — `items` may itself nest `items`. */
        items?: {
          type: string;
          description?: string;
          enum?: string[];
          properties?: Record<string, unknown>;
          required?: string[];
          additionalProperties?: unknown;
          items?: { type: string; description?: string };
        };
        /** For type:'object' nested params. */
        properties?: Record<string, unknown>;
        required?: string[];
      }>;
      required: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  name: string;
  args: string;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  toolCall?: ToolCall;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ChatOptions {
  apiKey?: string | null;
  model?: string | null;
  tools?: ToolDefinition[];
}

// ───────────────────────────────────────────────────────────────────────────
//  STREAM CHAT
// ───────────────────────────────────────────────────────────────────────────

export async function* streamChat(
  messages: ChatMessage[],
  modelOrOptions: string | ChatOptions = CHAT_MODEL,
): AsyncGenerator<StreamChunk> {
  const opts: ChatOptions = typeof modelOrOptions === 'string'
    ? { model: modelOrOptions }
    : modelOrOptions;

  const modelId = opts.model || CHAT_MODEL;
  const { client, sendAs } = getClientForModel(modelId, opts.apiKey);

  // Per-turn token budget (Claim 21). Clamp the requested output to whichever
  // is smaller — MAX_TOKENS or the per-turn output budget. Then validate the
  // input estimate; budget overrun throws LlmBudgetError before contact.
  const outputTokens = Math.min(MAX_TOKENS, LLM_BUDGET_OUTPUT_TOKENS);
  enforceBudget(messages, outputTokens);

  const requestParams: Parameters<typeof client.chat.completions.create>[0] = {
    model: sendAs,
    messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
    max_tokens: outputTokens,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (opts.tools && opts.tools.length > 0) {
    requestParams.tools = opts.tools as Parameters<typeof client.chat.completions.create>[0]['tools'];
  }

  // Retry only the connect call. Once chunks start flowing, mid-stream
  // retries would re-emit duplicate prefix text to the caller. If the
  // stream breaks mid-flight the error propagates verbatim per [[no-fallbacks]].
  const stream = await withRetry(
    () => client.chat.completions.create(requestParams) as Promise<AsyncIterable<ChatCompletionChunk>>,
    `streamChat(${sendAs}) connect`,
  );

  let toolCallAccumulator: { id: string; name: string; arguments: string } | null = null;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    const textDelta = delta?.content ?? '';
    const usage = chunk.usage;

    const tcDelta = delta?.tool_calls?.[0];
    if (tcDelta) {
      if (tcDelta.id) {
        toolCallAccumulator = {
          id: tcDelta.id,
          name: tcDelta.function?.name ?? '',
          arguments: tcDelta.function?.arguments ?? '',
        };
      } else if (toolCallAccumulator && tcDelta.function?.arguments) {
        toolCallAccumulator.arguments += tcDelta.function.arguments;
      }
    }

    if (usage) {
      yield {
        delta: textDelta,
        done: true,
        toolCall: toolCallAccumulator
          ? { id: toolCallAccumulator.id, name: toolCallAccumulator.name, args: toolCallAccumulator.arguments }
          : undefined,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
      };
    } else {
      yield { delta: textDelta, done: false };
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  NON-STREAM CHAT
// ───────────────────────────────────────────────────────────────────────────

export interface CompletionResult {
  content: string;
  toolCall?: ToolCall;
  promptTokens: number;
  completionTokens: number;
}

export async function chatCompletion(
  messages: ChatMessage[],
  modelOrOptions: string | ChatOptions = CHAT_MODEL,
): Promise<CompletionResult> {
  const opts: ChatOptions = typeof modelOrOptions === 'string'
    ? { model: modelOrOptions }
    : modelOrOptions;

  const modelId = opts.model || CHAT_MODEL;
  const { client, sendAs } = getClientForModel(modelId, opts.apiKey);

  // Per-turn token budget (Claim 21). Clamp the requested output to whichever
  // is smaller — MAX_TOKENS or the per-turn output budget. Then validate the
  // input estimate; budget overrun throws LlmBudgetError before contact.
  const outputTokens = Math.min(MAX_TOKENS, LLM_BUDGET_OUTPUT_TOKENS);
  enforceBudget(messages, outputTokens);

  const requestParams: Parameters<typeof client.chat.completions.create>[0] = {
    model: sendAs,
    messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
    max_tokens: outputTokens,
    stream: false,
  };

  if (opts.tools && opts.tools.length > 0) {
    requestParams.tools = opts.tools as Parameters<typeof client.chat.completions.create>[0]['tools'];
  }

  // Bounded retry with exponential backoff on transient upstream failures
  // (Claim 21). Final exhaustion re-throws verbatim per [[no-fallbacks]].
  const response = await withRetry(
    () => client.chat.completions.create(requestParams) as Promise<ChatCompletion>,
    `chatCompletion(${sendAs})`,
  );
  const choice = response.choices[0];
  const tc = choice?.message?.tool_calls?.[0];

  return {
    content: choice?.message?.content ?? '',
    toolCall: tc
      ? { id: tc.id, name: (tc as ChatCompletionMessageFunctionToolCall).function.name, args: (tc as ChatCompletionMessageFunctionToolCall).function.arguments }
      : undefined,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  };
}

// ───────────────────────────────────────────────────────────────────────────
//  BACKWARD-COMPAT EXPORT — some legacy callers may still import this.
//  Kept as a thin wrapper around getClientForModel() so its old shape works.
// ───────────────────────────────────────────────────────────────────────────

/** @deprecated Prefer streamChat/chatCompletion which auto-route via registry. */
export function getOpenRouterClient(apiKey?: string | null): OpenAI {
  const { client } = getClientForModel(CHAT_MODEL, apiKey);
  return client;
}
