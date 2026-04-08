import OpenAI from 'openai';

export const CHAT_MODEL = 'anthropic/claude-sonnet-4-5';
export const AUTO_MODEL = 'opsoul/auto';

export const MODEL_OPTIONS = [
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet', description: 'Best quality — deeper reasoning and richer responses' },
  { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku', description: 'Fast and balanced — great for most conversations' },
] as const;

const MAX_TOKENS = 2048;

let _defaultClient: OpenAI | null = null;

export function getOpenRouterClient(apiKey?: string | null): OpenAI {
  if (!apiKey) {
    if (!_defaultClient) {
      _defaultClient = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY!,
        defaultHeaders: {
          'HTTP-Referer': 'https://opsoul.ai',
          'X-Title': 'OpSoul v2.4',
        },
      });
    }
    return _defaultClient;
  }

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://opsoul.ai',
      'X-Title': 'OpSoul v2.4',
    },
  });
}

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
      properties: Record<string, { type: string; description: string }>;
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

export async function* streamChat(
  messages: ChatMessage[],
  modelOrOptions: string | ChatOptions = CHAT_MODEL,
): AsyncGenerator<StreamChunk> {
  const opts: ChatOptions = typeof modelOrOptions === 'string'
    ? { model: modelOrOptions }
    : modelOrOptions;

  const client = getOpenRouterClient(opts.apiKey);
  const model = opts.model || CHAT_MODEL;

  const requestParams: Parameters<typeof client.chat.completions.create>[0] = {
    model,
    messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
    max_tokens: MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (opts.tools && opts.tools.length > 0) {
    requestParams.tools = opts.tools as Parameters<typeof client.chat.completions.create>[0]['tools'];
  }

  const stream = await client.chat.completions.create(requestParams);

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

  const client = getOpenRouterClient(opts.apiKey);
  const model = opts.model || CHAT_MODEL;

  const requestParams: Parameters<typeof client.chat.completions.create>[0] = {
    model,
    messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
    max_tokens: MAX_TOKENS,
    stream: false,
  };

  if (opts.tools && opts.tools.length > 0) {
    requestParams.tools = opts.tools as Parameters<typeof client.chat.completions.create>[0]['tools'];
  }

  const response = await client.chat.completions.create(requestParams);
  const choice = response.choices[0];
  const tc = choice?.message?.tool_calls?.[0];

  return {
    content: choice?.message?.content ?? '',
    toolCall: tc
      ? { id: tc.id, name: tc.function.name, args: tc.function.arguments }
      : undefined,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  };
}
