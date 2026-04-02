import OpenAI from 'openai';

export const CHAT_MODEL = 'meta-llama/llama-3.3-70b-instruct';

export const MODEL_OPTIONS = [
  { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku', description: 'Fast and balanced — great for most conversations' },
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet', description: 'Best quality — deeper reasoning and richer responses' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', description: 'Free tier — solid performance at no extra cost' },
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

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ChatOptions {
  apiKey?: string | null;
  model?: string | null;
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

  const stream = await client.chat.completions.create({
    model,
    messages,
    max_tokens: MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    const usage = chunk.usage;

    if (usage) {
      yield {
        delta,
        done: true,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
      };
    } else {
      yield { delta, done: false };
    }
  }
}

export async function chatCompletion(
  messages: ChatMessage[],
  modelOrOptions: string | ChatOptions = CHAT_MODEL,
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const opts: ChatOptions = typeof modelOrOptions === 'string'
    ? { model: modelOrOptions }
    : modelOrOptions;

  const client = getOpenRouterClient(opts.apiKey);
  const model = opts.model || CHAT_MODEL;

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: MAX_TOKENS,
    stream: false,
  });

  return {
    content: response.choices[0]?.message?.content ?? '',
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  };
}
