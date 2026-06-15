/**
 * Model registry — single source of truth for LLM routing in OpSoul.
 *
 * All operators use Hajeri (gatekeeper) via the per-operator BYO model
 * config (operators.model_config JSONB). The registry entry below is the
 * platform fallback only — reached when no BYO config is set.
 *
 * Architecture:
 *   chat.ts / mcpServer.ts → openrouter.streamChat() → resolveModel(id)
 *                                                   → ProviderConfig
 *                                                   → OpenAI-compat SDK call
 */

export type AdapterKind = 'openai-compat' | 'anthropic' | 'google';

export interface ProviderConfig {
  provider: string;
  adapter: AdapterKind;
  baseURL: string;
  apiKeyEnv: string;
  modelOverride?: string;
  publicFallbackKey?: string;
  label: string;
  description: string;
  badge?: string;
  contextWindow: number;
  useMaxCompletionTokens?: boolean;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  // Platform fallback — reached only when no BYO model config is set.
  // Primary path: Hajeri gatekeeper via operators.model_config BYO override.
  'azure/gpt-4o': {
    provider: 'azure_openai',
    adapter: 'openai-compat',
    baseURL: 'https://hajeri-data.openai.azure.com/openai/deployments/gpt-4o',
    apiKeyEnv: 'AZURE_OPENAI_KEY',
    modelOverride: 'gpt-4o',
    label: 'GPT-4o (Azure)',
    description: 'Azure OpenAI — platform fallback',
    badge: 'Fallback',
    contextWindow: 128_000,
    useMaxCompletionTokens: true,
  },
};

export const DEFAULT_MODEL_ID = 'azure/gpt-4o';
export const BIRTH_MODEL_ID = DEFAULT_MODEL_ID;

export function resolveModel(modelId: string): { config: ProviderConfig; sendAs: string } {
  const exact = PROVIDERS[modelId];
  if (exact) {
    return { config: exact, sendAs: exact.modelOverride ?? modelId };
  }

  console.warn(`[modelRegistry] unknown model "${modelId}", falling back to ${DEFAULT_MODEL_ID}`);
  const fallback = PROVIDERS[DEFAULT_MODEL_ID];
  return { config: fallback, sendAs: fallback.modelOverride ?? DEFAULT_MODEL_ID };
}

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
