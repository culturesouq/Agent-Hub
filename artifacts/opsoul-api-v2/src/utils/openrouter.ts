export const CHAT_MODEL = 'anthropic/claude-sonnet-4-5';
export const KB_MODEL = 'anthropic/claude-haiku-4-5';
export const GROW_MODEL = 'anthropic/claude-sonnet-4-5';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionOpts {
  model?: string;
  apiKey?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  toolCalls?: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number };
}

function getApiKey(customKey?: string): string {
  const key = customKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is required');
  return key;
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts: ChatCompletionOpts = {},
): Promise<ChatCompletionResult> {
  const { model = CHAT_MODEL, apiKey, tools, maxTokens = 4096 } = opts;
  const key = getApiKey(apiKey);

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
  };
  if (tools && tools.length > 0) body.tools = tools;

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://opsoul.io',
      'X-Title': 'OpSoul v3',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{
      message: {
        content: string | null;
        tool_calls?: ToolCall[];
      };
    }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const choice = data.choices[0];
  return {
    content: choice.message.content ?? '',
    toolCalls: choice.message.tool_calls,
    usage: data.usage
      ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
      : undefined,
  };
}

export interface StreamChunk {
  delta?: string;
  toolCall?: { id: string; name: string; args: string };
  done?: boolean;
  usage?: { promptTokens: number; completionTokens: number };
}

export async function* streamChat(
  messages: ChatMessage[],
  opts: ChatCompletionOpts = {},
): AsyncGenerator<StreamChunk> {
  const { model = CHAT_MODEL, apiKey, tools, maxTokens = 4096 } = opts;
  const key = getApiKey(apiKey);

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    stream: true,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.stream_options = { include_usage: true };
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://opsoul.io',
      'X-Title': 'OpSoul v3',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter stream error ${res.status}: ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let toolCallId = '';
  let toolCallName = '';
  let toolCallArgs = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') {
        if (toolCallName) {
          yield { toolCall: { id: toolCallId, name: toolCallName, args: toolCallArgs } };
        }
        yield { done: true };
        return;
      }
      try {
        const chunk = JSON.parse(raw) as {
          choices?: Array<{
            delta?: {
              content?: string | null;
              tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
            };
          }>;
          usage?: { prompt_tokens: number; completion_tokens: number };
        };

        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          yield { delta: delta.content };
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.id) toolCallId = tc.id;
            if (tc.function?.name) toolCallName += tc.function.name;
            if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
          }
        }
        if (chunk.usage) {
          yield { done: true, usage: { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens } };
        }
      } catch {
        // malformed SSE line — skip
      }
    }
  }
}
