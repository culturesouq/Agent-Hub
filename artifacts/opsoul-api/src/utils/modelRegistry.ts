/**
 * Universal model registry — pluggable LLM/SDK abstraction for OpSoul.
 *
 * Maps a model identifier (e.g. "moonshotai/kimi-k2.5", "hajeri-3b-v2",
 * "claude-sonnet-4.6", "openai/gpt-5") to its provider endpoint
 * configuration. Lets operators set `defaultModel` to anything and have
 * OpSoul route the request to the correct backend automatically.
 *
 * Architecture:
 *   chat.ts / mcpServer.ts → openrouter.streamChat() → resolveModel(id)
 *                                                   → ProviderConfig
 *                                                   → OpenAI-compat SDK call
 *
 * Every supported provider today is OpenAI-compatible (Kimi via OpenRouter,
 * Hajeri via FastAPI, OpenAI itself, Together, Fireworks, Groq, etc.). The
 * resolveModel() function picks the baseURL + API key env var + optional
 * model-name override for the SDK call. Adding a new provider that's
 * OpenAI-compatible = one entry in the PROVIDERS table.
 *
 * For NON-OpenAI-compatible providers (Anthropic Messages API, Google
 * Gemini, etc.), the ProviderConfig.adapter field will dispatch to a
 * dedicated adapter module in utils/modelAdapters/ — that's a future
 * commit. For now all entries use the 'openai-compat' adapter.
 *
 * Single source of truth: every place that needs to know "where does model
 * X live" calls resolveModel(modelId). No hardcoded baseURLs scattered
 * around the codebase.
 */

export type AdapterKind = 'openai-compat' | 'anthropic' | 'google';

export interface ProviderConfig {
  /** Stable provider identifier. Used in logs. */
  provider: string;
  /** Which adapter handles this provider's wire format. */
  adapter: AdapterKind;
  /** HTTP base URL (without /v1 unless the provider needs it). */
  baseURL: string;
  /** Env var holding the API key for this provider. */
  apiKeyEnv: string;
  /**
   * Optional rename — what model string to send to the provider when the
   * operator-facing modelId differs. Example: operator sets
   * `defaultModel='hajeri-3b-v2'` but the Hajeri server expects model
   * name `hajeri-3b-v2` literally, so no rename needed. For OpenRouter,
   * the modelId IS what gets sent. Leave undefined when they match.
   */
  modelOverride?: string;
  /**
   * Optional default API key fallback for providers that don't strictly
   * need auth (e.g. local Hajeri behind RunPod proxy with the URL already
   * carrying access). Used only when both the operator's per-call apiKey
   * AND the env var are missing.
   */
  publicFallbackKey?: string;
  /** Display label for the frontend model picker. */
  label: string;
  /** Short description for the model picker. */
  description: string;
  /** Context window in tokens (for client-side prompt sizing decisions). */
  contextWindow: number;
}

/**
 * Provider registry — every model OpSoul can drive.
 *
 * To add a new model:
 *   1. Add an entry here.
 *   2. Add the env var (in deployment) for its API key.
 *   3. Done. chat.ts, mcpServer.ts, and the frontend picker all work
 *      automatically — single source of truth.
 *
 * Matching is by exact modelId string. Default fallback (when no match)
 * is OpenRouter, so all existing operators that use 'moonshotai/kimi-k2.5'
 * or other OpenRouter model strings keep working unchanged.
 */
const PROVIDERS: Record<string, ProviderConfig> = {
  // ── Kimi (Moonshot AI) via OpenRouter — the current default ────────────
  'moonshotai/kimi-k2.5': {
    provider: 'openrouter',
    adapter: 'openai-compat',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    label: 'Kimi K2.5',
    description: 'Moonshot AI — multimodal, self-directed agent swarm paradigm, 262K context',
    contextWindow: 262144,
  },

  // ── Hajeri 3B v2 (custom OpSoul model, hosted on RunPod) ────────────────
  // The Hajeri inference server speaks OpenAI /v1/chat/completions natively
  // (see /Users/bstar/hajeri_v2/hajeri_server.py). Set HAJERI_BASE_URL env
  // to the active RunPod proxy URL, e.g.:
  //   https://2crhkd6rdiqqdj-8888.proxy.runpod.net/v1
  // The server accepts any API key value — auth is via RunPod proxy URL.
  'hajeri-3b-v2': {
    provider: 'hajeri',
    adapter: 'openai-compat',
    baseURL: process.env.HAJERI_BASE_URL ?? '',
    apiKeyEnv: 'HAJERI_API_KEY',
    publicFallbackKey: 'hajeri-local',
    label: 'Hajeri 3B v2',
    description: 'OpSoul custom 3B model — GatedFusionEmbedding + QK-norm, English/Arabic',
    contextWindow: 2048,
  },

  // ── OpenAI (GPT family) ───────────────────────────────────────────────
  'openai/gpt-5': {
    provider: 'openai',
    adapter: 'openai-compat',
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelOverride: 'gpt-5',
    label: 'GPT-5',
    description: 'OpenAI GPT-5 — 1M context, multimodal',
    contextWindow: 1_000_000,
  },
  'openai/gpt-4o': {
    provider: 'openai',
    adapter: 'openai-compat',
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelOverride: 'gpt-4o',
    label: 'GPT-4o',
    description: 'OpenAI GPT-4o — multimodal, 128K context',
    contextWindow: 128_000,
  },

  // ── Anthropic (Claude family) ─────────────────────────────────────────
  // NOTE: 'anthropic' adapter is a placeholder; until utils/modelAdapters/
  // anthropic.ts exists, resolveModel() falls back to OpenRouter for these.
  // Claude is reachable via OpenRouter today: use 'anthropic/claude-sonnet-4.6'.
  'anthropic/claude-sonnet-4.6': {
    provider: 'openrouter',
    adapter: 'openai-compat',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    label: 'Claude Sonnet 4.6',
    description: 'Anthropic via OpenRouter — 200K context',
    contextWindow: 200_000,
  },
  'anthropic/claude-opus-4.7': {
    provider: 'openrouter',
    adapter: 'openai-compat',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    label: 'Claude Opus 4.7',
    description: 'Anthropic via OpenRouter — 1M context',
    contextWindow: 1_000_000,
  },

  // ── Google (Gemini family) — via OpenRouter for now ───────────────────
  'google/gemini-3-pro': {
    provider: 'openrouter',
    adapter: 'openai-compat',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    label: 'Gemini 3 Pro',
    description: 'Google Gemini 3 Pro via OpenRouter',
    contextWindow: 1_000_000,
  },

  // ── Auto routing sentinel — special-cased by chat.ts to pick a model ───
  'opsoul/auto': {
    provider: 'openrouter',
    adapter: 'openai-compat',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    label: 'OpSoul Auto',
    description: 'OpSoul auto-routing — picks a model per turn (default: Kimi K2.5)',
    contextWindow: 262144,
  },
};

/**
 * Default model when an operator has no defaultModel set OR when an
 * unknown model ID is encountered. Matches the historical CHAT_MODEL
 * constant from openrouter.ts so existing behavior is unchanged.
 */
export const DEFAULT_MODEL_ID = 'moonshotai/kimi-k2.5';

/**
 * Look up the provider config for a model.
 *
 * Lookup order:
 *   1. Exact match in PROVIDERS
 *   2. If not found and modelId looks like an OpenRouter model string
 *      (contains '/'), default to OpenRouter — preserves existing
 *      behavior where any OpenRouter-supported model just works.
 *   3. Otherwise fall back to DEFAULT_MODEL_ID's provider.
 *
 * Never throws — always returns a usable config.
 */
export function resolveModel(modelId: string): { config: ProviderConfig; sendAs: string } {
  const exact = PROVIDERS[modelId];
  if (exact) {
    return { config: exact, sendAs: exact.modelOverride ?? modelId };
  }

  // Heuristic: anything with a '/' is OpenRouter-shaped — let OpenRouter
  // route it. Keeps existing behavior for the long tail of OpenRouter
  // models we haven't catalogued here.
  if (modelId.includes('/')) {
    return {
      config: {
        provider: 'openrouter',
        adapter: 'openai-compat',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        label: modelId,
        description: 'OpenRouter (uncatalogued)',
        contextWindow: 32_000,
      },
      sendAs: modelId,
    };
  }

  // Unknown bare name — fall back to default. Log once so operators with
  // mistyped models are visible.
  console.warn(`[modelRegistry] unknown model "${modelId}", falling back to ${DEFAULT_MODEL_ID}`);
  const fallback = PROVIDERS[DEFAULT_MODEL_ID];
  return { config: fallback, sendAs: fallback.modelOverride ?? DEFAULT_MODEL_ID };
}

/**
 * Returns the list of catalogued models for the frontend picker. Order is
 * the declaration order in PROVIDERS so the UI is stable. Each entry
 * includes the operator-facing id + display label + context window.
 */
export interface ModelOption {
  id: string;
  label: string;
  description: string;
  provider: string;
  contextWindow: number;
}

export function listAvailableModels(): ModelOption[] {
  return Object.entries(PROVIDERS).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    description: cfg.description,
    provider: cfg.provider,
    contextWindow: cfg.contextWindow,
  }));
}

/** Convenience: resolve API key for a provider config, in priority order. */
export function resolveApiKey(
  config: ProviderConfig,
  operatorOverride?: string | null,
): string {
  if (operatorOverride) return operatorOverride;
  const envKey = process.env[config.apiKeyEnv];
  if (envKey) return envKey;
  if (config.publicFallbackKey) return config.publicFallbackKey;
  return '';
}
