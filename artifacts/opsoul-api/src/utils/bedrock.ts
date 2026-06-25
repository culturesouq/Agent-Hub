/**
 * LLM client — all platform completions go through Claude Sonnet 4.6 on AWS Bedrock.
 *
 * Public API (stable — callers do not change):
 *   - streamChat(messages, opts)     → AsyncGenerator<StreamChunk>
 *   - chatCompletion(messages, opts) → CompletionResult
 *   - CHAT_MODEL / KB_MODEL / AUTO_MODEL / MODEL_OPTIONS
 *
 * Platform path: AWS Bedrock Converse API, Bearer token auth (AWS_BEDROCK_API_KEY).
 */

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  resolveModel,
  listAvailableModels,
  DEFAULT_MODEL_ID,
} from './modelRegistry.js';

// ── PUBLIC CONSTANTS ──────────────────────────────────────────────────────────

export const CHAT_MODEL  = DEFAULT_MODEL_ID;
export const KB_MODEL    = DEFAULT_MODEL_ID;
export const AUTO_MODEL  = 'opsoul/auto';

export const MODEL_OPTIONS = listAvailableModels().map((m) => ({
  id: m.id, label: m.label, description: m.description,
}));

const MAX_TOKENS = 8192;

// ── RETRY + BUDGET ────────────────────────────────────────────────────────────

const LLM_MAX_RETRIES        = Number.parseInt(process.env.CHAT_LLM_MAX_RETRIES  ?? '3',      10);
const LLM_RETRY_DELAYS_MS    = [1000, 2000, 4000] as const;
const LLM_BUDGET_INPUT_TOKENS  = Number.parseInt(process.env.CHAT_LLM_BUDGET_TOKENS  ?? '200000', 10);
const LLM_BUDGET_OUTPUT_TOKENS = Number.parseInt(process.env.CHAT_LLM_OUTPUT_TOKENS  ?? '4096',   10);

export class LlmBudgetError extends Error {
  readonly code = 'llm_budget_exceeded';
  readonly estimatedInputTokens: number;
  readonly outputTokens: number;
  readonly budgetInputTokens: number;
  readonly budgetOutputTokens: number;
  constructor(estimatedInputTokens: number, outputTokens: number) {
    super(`Per-turn LLM token budget exceeded — estimated input ${estimatedInputTokens} + output ${outputTokens} > budget ${LLM_BUDGET_INPUT_TOKENS} + ${LLM_BUDGET_OUTPUT_TOKENS}`);
    this.estimatedInputTokens = estimatedInputTokens;
    this.outputTokens         = outputTokens;
    this.budgetInputTokens    = LLM_BUDGET_INPUT_TOKENS;
    this.budgetOutputTokens   = LLM_BUDGET_OUTPUT_TOKENS;
  }
}

function estimateInputTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    const c = m.content;
    if (typeof c === 'string') chars += c.length;
    else if (Array.isArray(c)) {
      for (const p of c) {
        if (p.type === 'text') chars += p.text.length;
        else if (p.type === 'image_url') chars += 1024;
      }
    }
  }
  return Math.ceil(chars / 4);
}

function enforceBudget(messages: ChatMessage[], requestedOutputTokens: number): void {
  const est = estimateInputTokens(messages);
  if (est > LLM_BUDGET_INPUT_TOKENS || requestedOutputTokens > LLM_BUDGET_OUTPUT_TOKENS) {
    throw new LlmBudgetError(est, requestedOutputTokens);
  }
}

function isRetryableError(err: unknown): boolean {
  const e = err as { status?: number; code?: string; name?: string; $metadata?: { httpStatusCode?: number } } | null;
  if (!e) return false;
  const status = e.status ?? e.$metadata?.httpStatusCode ?? null;
  if (typeof status === 'number') {
    if (status >= 500 || status === 408 || status === 429) return true;
    return false;
  }
  const code = e.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN') return true;
  if (e.name === 'AbortError') return true;
  return false;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || attempt === LLM_MAX_RETRIES) throw err;
      const delay = LLM_RETRY_DELAYS_MS[attempt] ?? 4000;
      console.warn(`[llmClient] ${label} — retry ${attempt + 1}/${LLM_MAX_RETRIES} in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ── SHARED TYPES (stable public surface) ─────────────────────────────────────

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type ChatMessage =
  | { role: 'system';    content: string | ContentPart[] }
  | { role: 'user';      content: string | ContentPart[] }
  | { role: 'assistant'; content: string | ContentPart[]; tool_calls?: AssistantToolCall[] }
  | { role: 'tool';      content: string; tool_call_id: string };

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
        items?: {
          type: string;
          description?: string;
          enum?: string[];
          properties?: Record<string, unknown>;
          required?: string[];
          additionalProperties?: unknown;
          items?: { type: string; description?: string };
        };
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

export interface ModelOverride {
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface ChatOptions {
  apiKey?: string | null;
  model?: string | null;
  tools?: ToolDefinition[];
  modelOverride?: ModelOverride;
}

export interface CompletionResult {
  content: string;
  toolCall?: ToolCall;
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
}

// ── BEDROCK CONVERSE API — FORMAT CONVERSION ──────────────────────────────────

type ConverseContentBlock =
  | { text: string }
  | { toolUse: { toolUseId: string; name: string; input: unknown } }
  | { toolResult: { toolUseId: string; status: 'success' | 'error'; content: Array<{ text: string }> } };

type ConverseMessage = { role: 'user' | 'assistant'; content: ConverseContentBlock[] };

function toConverseMessages(messages: ChatMessage[]): {
  system: Array<{ text: string }>;
  messages: ConverseMessage[];
} {
  const system: Array<{ text: string }> = [];
  const out: ConverseMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg.content as ContentPart[]).filter(p => p.type === 'text').map(p => (p as { type: 'text'; text: string }).text).join('\n');
      if (text.trim()) system.push({ text });
      continue;
    }

    if (msg.role === 'tool') {
      const block: ConverseContentBlock = {
        toolResult: {
          toolUseId: msg.tool_call_id,
          status: 'success',
          content: [{ text: msg.content }],
        },
      };
      const last = out[out.length - 1];
      if (last?.role === 'user') {
        last.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
      continue;
    }

    if (msg.role === 'assistant') {
      const blocks: ConverseContentBlock[] = [];
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg.content as ContentPart[]).filter(p => p.type === 'text').map(p => (p as { type: 'text'; text: string }).text).join('');
      if (text) blocks.push({ text });
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let input: unknown;
          try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
          blocks.push({ toolUse: { toolUseId: tc.id, name: tc.function.name, input } });
        }
      }
      if (blocks.length > 0) out.push({ role: 'assistant', content: blocks });
      continue;
    }

    if (msg.role === 'user') {
      const blocks: ConverseContentBlock[] = [];
      if (typeof msg.content === 'string') {
        blocks.push({ text: msg.content });
      } else {
        for (const p of msg.content as ContentPart[]) {
          if (p.type === 'text') blocks.push({ text: p.text });
        }
      }
      if (blocks.length > 0) out.push({ role: 'user', content: blocks });
    }
  }

  return { system, messages: out };
}

function toConverseTools(tools: ToolDefinition[]) {
  return tools.map(t => ({
    toolSpec: {
      name:        t.function.name,
      description: t.function.description,
      inputSchema: { json: t.function.parameters },
    },
  }));
}

// ── BEDROCK CLIENT (Bearer token auth via custom middleware) ──────────────────

const bedrockSdkClient = new BedrockRuntimeClient({
  region: 'us-east-1',
  credentials: { accessKeyId: 'BEDROCK_KEY', secretAccessKey: 'BEDROCK_KEY' },
});

bedrockSdkClient.middlewareStack.add(
  (next) => async (args) => {
    const req = args.request as { headers?: Record<string, string> };
    if (req?.headers) {
      const apiKey = process.env.AWS_BEDROCK_API_KEY ?? '';
      delete req.headers['authorization'];
      delete req.headers['Authorization'];
      delete req.headers['x-amz-date'];
      delete req.headers['x-amz-security-token'];
      delete req.headers['x-amz-content-sha256'];
      req.headers['authorization'] = `Bearer ${apiKey}`;
    }
    return next(args);
  },
  { step: 'finalizeRequest', name: 'bedrockBearerAuth', priority: 'low' },
);

// ── BEDROCK NON-STREAMING ─────────────────────────────────────────────────────

async function bedrockConverse(
  modelId: string,
  system: Array<{ text: string }>,
  messages: ConverseMessage[],
  tools: ToolDefinition[],
  maxTokens: number,
): Promise<CompletionResult> {
  const apiKey = process.env.AWS_BEDROCK_API_KEY ?? '';
  const body: Record<string, unknown> = { messages, inferenceConfig: { maxTokens } };
  if (system.length > 0) body.system = system;
  if (tools.length > 0) body.toolConfig = { tools: toConverseTools(tools) };

  const resp = await fetch(
    `https://bedrock-runtime.us-east-1.amazonaws.com/model/${modelId}/converse`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    },
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { message?: string };
    const error = Object.assign(new Error(err.message ?? `Bedrock HTTP ${resp.status}`), { status: resp.status });
    throw error;
  }

  const data = await resp.json() as {
    output?: { message?: { content?: Array<{ text?: string; toolUse?: { toolUseId?: string; name?: string; input?: unknown } }> } };
    usage?: { inputTokens?: number; outputTokens?: number };
  };

  let content  = '';
  let toolCall: ToolCall | undefined;
  for (const block of data.output?.message?.content ?? []) {
    if (block.text) content += block.text;
    if (block.toolUse) {
      toolCall = {
        id:   block.toolUse.toolUseId ?? '',
        name: block.toolUse.name      ?? '',
        args: JSON.stringify(block.toolUse.input ?? {}),
      };
    }
  }

  return {
    content,
    toolCall,
    promptTokens:     data.usage?.inputTokens  ?? 0,
    completionTokens: data.usage?.outputTokens ?? 0,
  };
}

// ── STREAM CHAT (public) ──────────────────────────────────────────────────────

export async function* streamChat(
  messages: ChatMessage[],
  modelOrOptions: string | ChatOptions = CHAT_MODEL,
): AsyncGenerator<StreamChunk> {
  const opts: ChatOptions = typeof modelOrOptions === 'string' ? { model: modelOrOptions } : modelOrOptions;
  const outputTokens = Math.min(MAX_TOKENS, LLM_BUDGET_OUTPUT_TOKENS);
  enforceBudget(messages, outputTokens);

  const { sendAs } = resolveModel(opts.model ?? CHAT_MODEL);
  const { system, messages: convMessages } = toConverseMessages(messages);
  const response = await withRetry(
    () => bedrockSdkClient.send(new ConverseStreamCommand(
      Object.assign(
        { modelId: sendAs, messages: convMessages, inferenceConfig: { maxTokens: outputTokens } },
        system.length > 0 ? { system } : {},
        opts.tools?.length ? { toolConfig: { tools: toConverseTools(opts.tools) } } : {},
      ) as Parameters<typeof ConverseStreamCommand>[0],
    )),
    `bedrockStreamChat(${sendAs}) connect`,
  );

  let toolAccumulator: { id: string; name: string; arguments: string } | null = null;
  let inputTokens = 0, outputTokensActual = 0;

  for await (const event of response.stream!) {
    if (event.contentBlockDelta) {
      const d = event.contentBlockDelta.delta;
      if (d?.text) yield { delta: d.text, done: false };
      else if (d?.toolUse?.input && toolAccumulator) toolAccumulator.arguments += d.toolUse.input;
    } else if (event.contentBlockStart?.start?.toolUse) {
      const tu = event.contentBlockStart.start.toolUse;
      toolAccumulator = { id: tu.toolUseId ?? '', name: tu.name ?? '', arguments: '' };
    } else if (event.metadata?.usage) {
      inputTokens        = event.metadata.usage.inputTokens  ?? 0;
      outputTokensActual = event.metadata.usage.outputTokens ?? 0;
    } else if (event.messageStop) {
      yield {
        delta: '', done: true,
        toolCall: toolAccumulator ? { id: toolAccumulator.id, name: toolAccumulator.name, args: toolAccumulator.arguments } : undefined,
        usage: { promptTokens: inputTokens, completionTokens: outputTokensActual, totalTokens: inputTokens + outputTokensActual },
      };
    }
  }
}

// ── CHAT COMPLETION (public) ──────────────────────────────────────────────────

export async function chatCompletion(
  messages: ChatMessage[],
  modelOrOptions: string | ChatOptions = CHAT_MODEL,
): Promise<CompletionResult> {
  const opts: ChatOptions = typeof modelOrOptions === 'string' ? { model: modelOrOptions } : modelOrOptions;
  const outputTokens = Math.min(MAX_TOKENS, LLM_BUDGET_OUTPUT_TOKENS);
  enforceBudget(messages, outputTokens);

  const { sendAs } = resolveModel(opts.model ?? CHAT_MODEL);
  const { system, messages: convMessages } = toConverseMessages(messages);
  return await withRetry(
    () => bedrockConverse(sendAs, system, convMessages, opts.tools ?? [], outputTokens),
    `bedrockChatCompletion(${sendAs})`,
  );
}
