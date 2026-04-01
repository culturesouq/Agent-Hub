import OpenAI from 'openai';

const CHAT_MODEL = 'meta-llama/llama-3.3-70b-instruct';
const MAX_TOKENS = 2048;

let _client: OpenAI | null = null;

export function getOpenRouterClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY!,
      defaultHeaders: {
        'HTTP-Referer': 'https://opsoul.ai',
        'X-Title': 'OpSoul v2.4',
      },
    });
  }
  return _client;
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

export async function* streamChat(
  messages: ChatMessage[],
  model: string = CHAT_MODEL,
): AsyncGenerator<StreamChunk> {
  const client = getOpenRouterClient();

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
  model: string = CHAT_MODEL,
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const client = getOpenRouterClient();

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

export { CHAT_MODEL };
