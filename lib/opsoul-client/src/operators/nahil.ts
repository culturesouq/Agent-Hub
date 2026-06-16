// @opsoul/client/nahil — Nahil operator sub-path export.
// Pre-configured client for the Nahil AI app's three slot-key audiences.
// No OpSoul identity/soul/code lives here — only the HTTP transport layer.
//
// Usage:
//   import { createNahilClient } from '@opsoul/client/nahil'
//   const client = createNahilClient({
//     authKey:   process.env.NAHIL_AUTH_API_KEY,
//     publicKey: process.env.NAHIL_PUBLIC_API_KEY,
//     actionKey: process.env.NAHIL_ACTION_API_KEY,
//   })
//   const { content } = await client.chat({ message, conversationId, userId })
//   const text = await client.action(directive, payload)

const DEFAULT_BASE_URL = 'https://opsoul.mangoforest-5c22eab7.uaenorth.azurecontainerapps.io';

export interface NahilClientConfig {
  baseUrl?:   string;
  authKey:    string;
  publicKey?: string;
  actionKey?: string;
}

export interface NahilChatResult {
  content:        string;
  model:          string;
  conversationId: string | null;
}

export class NahilClient {
  private readonly baseUrl:    string;
  private readonly authKey:    string;
  private readonly publicKey:  string | undefined;
  private readonly actionKey:  string | undefined;

  constructor(config: NahilClientConfig) {
    this.baseUrl   = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.authKey   = config.authKey;
    this.publicKey = config.publicKey;
    this.actionKey = config.actionKey;
  }

  private async post(path: string, body: unknown, key: string, timeoutMs?: number): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpSoul ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  }

  private pickContent(r: unknown): string {
    const obj = r as Record<string, unknown>;
    if (typeof obj?.content === 'string') return obj.content;
    if (typeof obj?.result === 'string') return obj.result;
    if (typeof (obj?.message as Record<string, unknown>)?.content === 'string')
      return (obj.message as Record<string, unknown>).content as string;
    if (typeof obj?.response === 'string') return obj.response;
    if (obj != null) {
      const keys = Object.keys(obj).slice(0, 8).join(',');
      console.warn(`[opsoul/nahil] pickContent: no known field. Keys: [${keys}]`);
    }
    return '';
  }

  // User-facing chat. Routes to /v1/chat with the correct slot key:
  //   userId present → AUTH key (operator can call back into Nahil)
  //   userId absent  → PUBLIC key (unauthenticated visitor)
  //   PUBLIC unset   → fall back to AUTH
  async chat({ message, conversationId, userId }: {
    message:         string;
    conversationId?: string | number | null;
    userId?:         string | number | null;
  }): Promise<NahilChatResult> {
    const key = userId ? this.authKey : (this.publicKey ?? this.authKey);
    if (!key) throw new Error('OPSOUL_KEY_MISSING: Nahil slot key is not configured');
    if (!message?.trim()) {
      return {
        content:        '',
        model:          'opsoul-nahil',
        conversationId: conversationId != null ? String(conversationId) : null,
      };
    }
    const result = await this.post('/v1/chat', {
      message:        message.trim(),
      conversationId: conversationId != null ? String(conversationId) : undefined,
      stream:         false,
      ...(userId ? { userId: String(userId) } : {}),
    }, key) as Record<string, unknown>;

    return {
      content:        this.pickContent(result),
      model:          typeof result.model === 'string' ? result.model : 'opsoul-nahil',
      conversationId: typeof result.conversationId === 'string'
        ? result.conversationId
        : (conversationId != null ? String(conversationId) : null),
    };
  }

  // Backend action. Routes to /v1/action with the ACTION slot key.
  // directive: short discriminator (≤500 chars) — operator sees this first
  // payload:   arbitrary object — appended as "Payload:\n{...}" by OpSoul
  // timeoutMs: optional per-call timeout (e.g. 120_000 for journey tools)
  async action(directive: string, payload?: Record<string, unknown>, timeoutMs?: number): Promise<string> {
    if (!this.actionKey) throw new Error('OPSOUL_KEY_MISSING: ACTION key not configured');
    const result = await this.post('/v1/action', {
      action: directive,
      ...(payload ? { payload } : {}),
    }, this.actionKey, timeoutMs) as Record<string, unknown>;
    return this.pickContent(result);
  }
}

export function createNahilClient(config: NahilClientConfig): NahilClient {
  return new NahilClient(config);
}
