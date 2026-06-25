/**
 * Model registry — single source of truth for LLM routing in OpSoul.
 *
 * One model: Claude Sonnet 4.6 via AWS Bedrock Converse API.
 * No routing, no fallbacks, no alternatives. One brain.
 *
 * Auth: AWS Bedrock long-term API key (Bearer token).
 * Env var: AWS_BEDROCK_API_KEY
 */

export type AdapterKind = 'bedrock';

export interface ProviderConfig {
  provider:      string;
  adapter:       AdapterKind;
  baseURL:       string;
  apiKeyEnv:     string;
  awsRegion?:    string;
  modelOverride?: string;
  label:         string;
  description:   string;
  badge?:        string;
  contextWindow: number;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  'bedrock/claude-sonnet-4-6': {
    provider:      'bedrock',
    adapter:       'bedrock',
    baseURL:       'https://bedrock-runtime.us-east-1.amazonaws.com',
    apiKeyEnv:     'AWS_BEDROCK_API_KEY',
    awsRegion:     'us-east-1',
    modelOverride: 'us.anthropic.claude-sonnet-4-6',
    label:         'Claude Sonnet 4.6 (Bedrock)',
    description:   'Anthropic Claude Sonnet 4.6 — reasoning, tool use, 1M context',
    badge:         'Default',
    contextWindow: 1_000_000,
  },
};

export const DEFAULT_MODEL_ID = 'bedrock/claude-sonnet-4-6';
export const BIRTH_MODEL_ID   = DEFAULT_MODEL_ID;

export function resolveModel(modelId: string): { config: ProviderConfig; sendAs: string } {
  const exact = PROVIDERS[modelId];
  if (exact) return { config: exact, sendAs: exact.modelOverride ?? modelId };
  // Any unknown / legacy model ID → Sonnet 4.6.
  const fallback = PROVIDERS[DEFAULT_MODEL_ID];
  return { config: fallback, sendAs: fallback.modelOverride! };
}

export interface ModelOption {
  id:            string;
  label:         string;
  description:   string;
  provider:      string;
  badge?:        string;
  contextWindow: number;
}

export function listAvailableModels(): ModelOption[] {
  return Object.entries(PROVIDERS).map(([id, cfg]) => ({
    id,
    label:         cfg.label,
    description:   cfg.description,
    provider:      cfg.provider,
    badge:         cfg.badge,
    contextWindow: cfg.contextWindow,
  }));
}

export function resolveApiKey(
  config: ProviderConfig,
  _operatorOverride?: string | null,
): string {
  return process.env[config.apiKeyEnv] ?? '';
}
