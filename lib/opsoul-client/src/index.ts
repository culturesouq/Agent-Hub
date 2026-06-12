// ─── OpSoul Client ────────────────────────────────────────────────────────────
// Thin TypeScript HTTP client for self-hosted OpSoul servers.
// Zero external dependencies — native fetch only.

// ─── Error ───────────────────────────────────────────────────────────────────

export class OpSoulError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'OpSoulError';
    this.status = status;
    this.code = code;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpSoulClientOptions {
  /** e.g. "http://localhost:3001" or "https://opsoul.mycompany.com" */
  baseUrl: string;
  /** Owner API key (access token from /api/auth/login). Not required for publicChat. */
  apiKey?: string;
  /** Request timeout in milliseconds. Default: 30000 */
  timeout?: number;
}

// Operator

export interface Layer2Soul {
  personalityTraits?: string[];
  toneProfile?: string | null;
  communicationStyle?: string | null;
  quirks?: string[];
  valuesManifestation?: string[];
  emotionalRange?: string | null;
  decisionMakingStyle?: string | null;
  conflictResolution?: string | null;
  openingMessage?: string | null;
  backstory?: string | null;
}

export interface Operator {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  roles: string[];
  mandate: string;
  rawIdentity: string | null;
  coreValues: string[];
  ethicalBoundaries: string[];
  layer1LockedAt: string | null;
  soul: Layer2Soul | null;
  growLockLevel: string;
  lockedUntil: string | null;
  safeMode: boolean;
  freeRoaming: boolean | null;
  toolUsePolicy: Record<string, unknown>;
  hasCustomApiKey: boolean;
  defaultModel: string | null;
  createdAt: string;
}

export interface CreateOperatorInput {
  slug: string;
  name: string;
  archetype: string[];
  roles?: string[];
  mandate: string;
  rawIdentity?: string;
  coreValues: string[];
  ethicalBoundaries: string[];
  layer2Soul: Layer2Soul;
  growLockLevel?: string;
  safeMode?: boolean;
  toolUsePolicy?: Record<string, unknown>;
}

export interface UpdateOperatorInput {
  name?: string;
  mandate?: string;
  rawIdentity?: string;
  coreValues?: string[];
  ethicalBoundaries?: string[];
  archetype?: string[];
  roles?: string[];
  safeMode?: boolean;
  freeRoaming?: boolean;
  toolUsePolicy?: Record<string, unknown>;
}

// Auth

export interface LoginResult {
  token: string;
  owner: {
    id: string;
    email: string;
    name: string | null;
    isSovereignAdmin: boolean;
  };
}

// Chat

export interface ChatAttachment {
  type: 'image' | 'text' | 'url';
  content: string;
  mimeType?: string;
  name?: string;
}

export interface ChatOptions {
  conversationId?: string;
  kbSearch?: boolean;
  kbTopN?: number;
  kbMinConfidence?: number;
  attachments?: ChatAttachment[];
}

export interface ChatStreamOptions extends ChatOptions {
  onChunk?: (chunk: ChatChunk) => void;
}

export interface ChatResponse {
  messageId: string;
  conversationId: string;
  role: 'assistant';
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  activeSkillCount?: number;
  memoryCount?: number;
  layer1WasLocked?: boolean;
  leakFeedback?: unknown;
}

export interface ChatChunk {
  delta?: string;
  done?: boolean;
  messageId?: string;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  reading?: string;
  processing?: boolean;
  clear?: boolean;
  error?: string;
  leakFeedback?: unknown;
}

// Public chat

export interface PublicChatOptions {
  userId?: string;
  conversationId?: string;
  attachments?: Array<{
    type: 'image' | 'text';
    content: string;
    mimeType?: string;
    name?: string;
  }>;
}

export interface PublicChatResponse {
  conversationId: string;
  message: { role: 'assistant'; content: string };
  scopeId: string;
  leakFeedback?: unknown;
}

// Model config

export type ModelConfigProvider = 'openai' | 'anthropic' | 'azure_openai' | 'openrouter' | 'custom';

export interface ModelConfig {
  configured: boolean;
  isActive: boolean;
  provider?: ModelConfigProvider;
  modelId?: string;
  apiKeyMasked?: string | null;
  baseUrl?: string | null;
}

export interface SetModelConfigInput {
  provider: ModelConfigProvider;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
}

export interface ModelConfigTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

// GROW

export interface GrowProposal {
  id: string;
  operatorId: string;
  status: string;
  targetField: string;
  proposedValue: unknown;
  rationale: string;
  confidence: number;
  allProposedChanges: Record<string, unknown>;
  claudeReasoning?: string | null;
  claudeEvaluation?: Record<string, unknown> | null;
  proposedChanges?: Record<string, unknown> | null;
  ownerDecision?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

export interface GrowResult {
  proposalId?: string;
  status: string;
  message?: string;
  [key: string]: unknown;
}

export interface SelfAwareness {
  operatorId: string;
  healthScore?: { score: number; label: string } | null;
  mandateGaps?: unknown;
  soulState?: unknown;
  capabilityState?: unknown;
  workspaceManifest?: unknown;
  lastUpdateTrigger?: string | null;
  lastUpdated?: string | null;
  [key: string]: unknown;
}

// Secrets

export interface SecretLabel {
  id: string;
  key: string;
  createdAt: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class OpSoulClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeout: number;

  constructor(options: OpSoulClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? 30_000;
  }

  // ── Internal request helper ───────────────────────────────────────────────

  private async request<T>(
    path: string,
    init: RequestInit = {},
    overrideApiKey?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    const key = overrideApiKey ?? this.apiKey;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      let code: string | undefined;
      try {
        const body = await res.json() as { error?: string; code?: string };
        if (body.error) message = body.error;
        code = body.code;
      } catch { /* ignore parse failure */ }
      throw new OpSoulError(res.status, message, code);
    }

    // 204 No Content
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return undefined as unknown as T;
    }
    return res.json() as Promise<T>;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<LoginResult> {
    const data = await this.request<{
      accessToken: string;
      owner: { id: string; email: string; name: string | null; isSovereignAdmin: boolean };
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return {
      token: data.accessToken,
      owner: data.owner,
    };
  }

  // ── Operators ─────────────────────────────────────────────────────────────

  async listOperators(): Promise<Operator[]> {
    return this.request<Operator[]>('/api/operators');
  }

  async getOperator(operatorId: string): Promise<Operator> {
    return this.request<Operator>(`/api/operators/${operatorId}`);
  }

  async createOperator(data: CreateOperatorInput): Promise<Operator> {
    return this.request<Operator>('/api/operators', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOperator(operatorId: string, data: UpdateOperatorInput): Promise<Operator> {
    return this.request<Operator>(`/api/operators/${operatorId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteOperator(operatorId: string): Promise<void> {
    await this.request<{ ok: boolean; deleted: string }>(
      `/api/operators/${operatorId}`,
      { method: 'DELETE' },
    );
  }

  // ── Chat — authenticated ──────────────────────────────────────────────────

  /**
   * Send a message and receive the full response synchronously.
   * Requires a conversationId — create one first via the conversations API or
   * use the blank operator creation endpoint which returns one.
   */
  async chat(
    operatorId: string,
    conversationId: string,
    message: string,
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    return this.request<ChatResponse>(
      `/api/operators/${operatorId}/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          stream: false,
          kbSearch: options?.kbSearch ?? true,
          kbTopN: options?.kbTopN,
          kbMinConfidence: options?.kbMinConfidence,
          attachments: options?.attachments,
        }),
      },
    );
  }

  /**
   * Stream a chat response token-by-token via Server-Sent Events.
   * Yields ChatChunk objects including delta text, done signal, and usage.
   */
  async *chatStream(
    operatorId: string,
    conversationId: string,
    message: string,
    options?: ChatStreamOptions,
  ): AsyncGenerator<ChatChunk> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let res: Response;
    try {
      res = await fetch(
        `${this.baseUrl}/api/operators/${operatorId}/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message,
            stream: true,
            kbSearch: options?.kbSearch ?? true,
            kbTopN: options?.kbTopN,
            kbMinConfidence: options?.kbMinConfidence,
            attachments: options?.attachments,
          }),
          signal: controller.signal,
        },
      );
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }

    if (!res.ok) {
      clearTimeout(timer);
      let message = `HTTP ${res.status}`;
      let code: string | undefined;
      try {
        const body = await res.json() as { error?: string; code?: string };
        if (body.error) message = body.error;
        code = body.code;
      } catch { /* ignore */ }
      throw new OpSoulError(res.status, message, code);
    }

    try {
      yield* this._readSseStream<ChatChunk>(res);
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Chat — public (slot-key auth, no owner API key needed) ───────────────

  /**
   * Send a message to a deployed operator via the public /v1/chat endpoint.
   * Requires the deployment slot key as apiKey on the client, or passed as slotKey.
   */
  async publicChat(
    message: string,
    options?: PublicChatOptions & { slotKey?: string },
  ): Promise<PublicChatResponse> {
    const slotKey = options?.slotKey ?? this.apiKey;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (slotKey) {
      headers['Authorization'] = `Bearer ${slotKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          stream: false,
          userId: options?.userId,
          conversationId: options?.conversationId,
          attachments: options?.attachments,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      let code: string | undefined;
      try {
        const body = await res.json() as { error?: string; code?: string };
        if (body.error) errMsg = body.error;
        code = body.code;
      } catch { /* ignore */ }
      throw new OpSoulError(res.status, errMsg, code);
    }

    return res.json() as Promise<PublicChatResponse>;
  }

  /**
   * Stream a public chat response token-by-token.
   * Requires the deployment slot key as apiKey on the client, or passed as slotKey.
   */
  async *publicChatStream(
    message: string,
    options?: PublicChatOptions & { slotKey?: string },
  ): AsyncGenerator<ChatChunk> {
    const slotKey = options?.slotKey ?? this.apiKey;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (slotKey) {
      headers['Authorization'] = `Bearer ${slotKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          stream: true,
          userId: options?.userId,
          conversationId: options?.conversationId,
          attachments: options?.attachments,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }

    if (!res.ok) {
      clearTimeout(timer);
      let errMsg = `HTTP ${res.status}`;
      let code: string | undefined;
      try {
        const body = await res.json() as { error?: string; code?: string };
        if (body.error) errMsg = body.error;
        code = body.code;
      } catch { /* ignore */ }
      throw new OpSoulError(res.status, errMsg, code);
    }

    try {
      yield* this._readSseStream<ChatChunk>(res);
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Model config (BYO model) ──────────────────────────────────────────────

  async getModelConfig(operatorId: string): Promise<ModelConfig> {
    return this.request<ModelConfig>(`/api/operators/${operatorId}/model-config`);
  }

  async setModelConfig(operatorId: string, config: SetModelConfigInput): Promise<void> {
    await this.request<{ ok: boolean; configured: boolean; modelId: string; provider: string }>(
      `/api/operators/${operatorId}/model-config`,
      {
        method: 'PUT',
        body: JSON.stringify(config),
      },
    );
  }

  async testModelConfig(
    operatorId: string,
    config: SetModelConfigInput,
  ): Promise<ModelConfigTestResult> {
    return this.request<ModelConfigTestResult>(
      `/api/operators/${operatorId}/model-config/test`,
      {
        method: 'POST',
        body: JSON.stringify(config),
      },
    );
  }

  async clearModelConfig(operatorId: string): Promise<void> {
    await this.request<{ ok: boolean; configured: boolean }>(
      `/api/operators/${operatorId}/model-config`,
      { method: 'DELETE' },
    );
  }

  // ── GROW ──────────────────────────────────────────────────────────────────

  async getGrowProposals(operatorId: string): Promise<GrowProposal[]> {
    const data = await this.request<{ operatorId: string; count: number; proposals: GrowProposal[] }>(
      `/api/operators/${operatorId}/grow/proposals`,
    );
    return data.proposals;
  }

  async triggerGrow(operatorId: string): Promise<GrowResult> {
    return this.request<GrowResult>(`/api/operators/${operatorId}/grow/trigger`, {
      method: 'POST',
    });
  }

  async decideProposal(
    operatorId: string,
    proposalId: string,
    decision: 'approve' | 'reject',
    reason?: string,
  ): Promise<void> {
    await this.request<{ ok: boolean; proposalId: string; status: string }>(
      `/api/operators/${operatorId}/grow/proposals/${proposalId}/decide`,
      {
        method: 'PATCH',
        body: JSON.stringify({ decision, reason }),
      },
    );
  }

  async getSelfAwareness(operatorId: string): Promise<SelfAwareness> {
    return this.request<SelfAwareness>(`/api/operators/${operatorId}/grow/self-awareness`);
  }

  // ── Secrets ───────────────────────────────────────────────────────────────

  async listSecrets(operatorId: string): Promise<SecretLabel[]> {
    const data = await this.request<{ secrets: SecretLabel[] }>(
      `/api/operators/${operatorId}/secrets`,
    );
    return data.secrets;
  }

  /**
   * Store a secret. Key must be uppercase letters, numbers, and underscores only.
   * If a secret with the same key already exists, it is overwritten.
   */
  async storeSecret(operatorId: string, key: string, value: string): Promise<void> {
    await this.request<SecretLabel>(`/api/operators/${operatorId}/secrets`, {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
  }

  async deleteSecret(operatorId: string, secretId: string): Promise<void> {
    await this.request<{ ok: boolean; deleted: string }>(
      `/api/operators/${operatorId}/secrets/${secretId}`,
      { method: 'DELETE' },
    );
  }

  // ── SSE stream reader ─────────────────────────────────────────────────────

  private async *_readSseStream<T>(res: Response): AsyncGenerator<T> {
    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            yield JSON.parse(raw) as T;
          } catch { /* malformed SSE line — skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createClient(options: OpSoulClientOptions): OpSoulClient {
  return new OpSoulClient(options);
}
