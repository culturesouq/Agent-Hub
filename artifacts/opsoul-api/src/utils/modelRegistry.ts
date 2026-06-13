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
   * Azure OpenAI api-version query param. Required for Azure deployments.
   * When set, buildClient injects it as defaultQuery and uses api-key header
   * instead of Authorization: Bearer.
   */
  apiVersion?: string;
  /**
   * GPT-5 and o-series models reject max_tokens — they require
   * max_completion_tokens instead. Set true for those models.
   */
  useMaxCompletionTokens?: boolean;
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
  /** Optional short pill rendered next to the option in SettingsSection. */
  badge?: string;
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
  // ── Azure OpenAI — GPT-5 (operator chat, main model) ─────────────────
  // Deployed 2026-06-13 on hajeri-data (eastus, hajeri-platform).
  // GlobalStandard, 10K TPM. Prompt caching: 90% off input after 1024-token
  // prefix — system prompt + DNA + KB cached automatically; effective input
  // cost ~$0.125/1M for repeated turns.
  'azure/gpt-5': {
    provider: 'azure',
    adapter: 'openai-compat',
    baseURL: 'https://hajeri-data.openai.azure.com/openai/deployments/gpt-5',
    apiKeyEnv: 'AZURE_OPENAI_KEY',
    apiVersion: '2025-02-01-preview',
    modelOverride: 'gpt-5',
    useMaxCompletionTokens: true,
    label: 'GPT-5',
    description: 'Azure OpenAI GPT-5 — 200K context, 90% cached input discount',
    badge: 'Default',
    contextWindow: 200_000,
  },

  // ── Hajeri 3B v2 (custom OpSoul model, hosted on RunPod) ────────────────
  'hajeri-3b-v2': {
    provider: 'hajeri',
    adapter: 'openai-compat',
    baseURL: process.env.HAJERI_BASE_URL ?? '',
    apiKeyEnv: 'HAJERI_API_KEY',
    publicFallbackKey: 'hajeri-local',
    label: 'Hajeri 3B v2',
    description: 'OpSoul custom — GatedFusionEmbedding + QK-norm, English/Arabic',
    badge: 'Custom',
    contextWindow: 2048,
  },
};

/**
 * Default model for operator chat — Azure GPT-5.
 * Migrated 2026-06-13 from moonshotai/kimi-k2.5 (OpenRouter) to Azure OpenAI.
 * GPT-5 chosen: best reasoning, 200K context, 90% cached input discount on
 * repeated system prompt + DNA + KB blocks.
 */
export const DEFAULT_MODEL_ID = 'azure/gpt-5';

/**
 * Birth-time model — same as chat: GPT-5. Birth is the most important moment
 * in an operator's life; it uses the same model as all other OpSoul operations.
 */
export const BIRTH_MODEL_ID = DEFAULT_MODEL_ID;

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

  // Unknown model — fall back to default. Log so mistyped models are visible.
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
  badge?: string;
  contextWindow: number;
}

export function listAvailableModels(): ModelOption[] {
  return Object.entries(PROVIDERS).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    description: cfg.description,
    provider: cfg.provider,
    badge: cfg.badge,
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
