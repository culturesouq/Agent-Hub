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
        /** For type:'array' params. JSON-Schema-shaped recursive item descriptor. */
        items?: { type: string; description?: string; enum?: string[]; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown };
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

  const requestParams: Parameters<typeof client.chat.completions.create>[0] = {
    model: sendAs,
    messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
    max_tokens: MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (opts.tools && opts.tools.length > 0) {
    requestParams.tools = opts.tools as Parameters<typeof client.chat.completions.create>[0]['tools'];
  }

  const stream = await client.chat.completions.create(requestParams) as AsyncIterable<ChatCompletionChunk>;

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

  const requestParams: Parameters<typeof client.chat.completions.create>[0] = {
    model: sendAs,
    messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
    max_tokens: MAX_TOKENS,
    stream: false,
  };

  if (opts.tools && opts.tools.length > 0) {
    requestParams.tools = opts.tools as Parameters<typeof client.chat.completions.create>[0]['tools'];
  }

  const response = await client.chat.completions.create(requestParams) as ChatCompletion;
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
