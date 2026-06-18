/**
 * Per-operator BYO model configuration — load, store, and test.
 *
 * Operators (customers who self-host OpSoul) can bring their own AI model
 * API keys. This module reads/writes the modelConfig JSONB column on the
 * operators table and exposes the loaded config as a ModelOverride ready
 * for chatCompletion() / streamChat().
 *
 * Storage: operators.model_config JSONB — see migrations/add_operator_model_config.sql
 * The migration must be run manually before this feature is active.
 *
 * API key security:
 *   - Encrypted at rest using the platform encryption key (same scheme as
 *     openrouterApiKey — encryptToken / decryptToken from opsoul-utils).
 *   - Never returned in plaintext from GET routes — callers get a masked key.
 *   - The raw key only appears in RAM during a request and is not logged.
 */

import { db } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { encryptToken, decryptToken } from '@workspace/opsoul-utils/crypto';
import type { ModelOverride } from './openrouter.js';
import { chatCompletion } from './openrouter.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelProvider = 'openai' | 'anthropic' | 'azure_openai' | 'openrouter' | 'custom';

export interface OperatorModelConfig {
  provider: ModelProvider;
  modelId: string;
  /** Encrypted API key (stored in DB). Raw key on input — encrypted before write. */
  apiKey: string;
  baseUrl?: string;
}

/**
 * Shape stored in the model_config JSONB column.
 * The apiKey field holds the encrypted ciphertext.
 */
interface StoredModelConfig {
  provider: ModelProvider;
  modelId: string;
  apiKeyEncrypted: string;
  baseUrl?: string;
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load an operator's custom model config and return it as a ModelOverride
 * ready for chatCompletion(). Returns null if the operator has no custom
 * model configured — callers fall back to the platform default.
 */
export async function getOperatorModelOverride(operatorId: string): Promise<ModelOverride | null> {
  const [op] = await db
    .select({ modelConfig: operatorsTable.modelConfig })
    .from(operatorsTable)
    .where(eq(operatorsTable.id, operatorId));

  if (!op) return null;

  const stored = op.modelConfig as StoredModelConfig | null | undefined;
  if (!stored || !stored.apiKeyEncrypted || !stored.modelId) return null;

  let apiKey: string;
  try {
    apiKey = decryptToken(stored.apiKeyEncrypted);
  } catch (err) {
    console.warn(`[operatorModelConfig] failed to decrypt API key for operator ${operatorId}:`, (err as Error).message);
    return null;
  }

  return {
    model: stored.modelId,
    apiKey,
    baseUrl: stored.baseUrl,
    provider: stored.provider,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Store an operator's custom model config, encrypting the API key.
 * The plain-text apiKey is never persisted.
 */
export async function setOperatorModelConfig(
  operatorId: string,
  config: OperatorModelConfig,
): Promise<void> {
  const apiKeyEncrypted = encryptToken(config.apiKey.trim());

  const stored: StoredModelConfig = {
    provider: config.provider,
    modelId: config.modelId.trim(),
    apiKeyEncrypted,
    baseUrl: config.baseUrl?.trim() || undefined,
  };

  await db
    .update(operatorsTable)
    .set({ modelConfig: stored })
    .where(eq(operatorsTable.id, operatorId));
}

/**
 * Clear an operator's custom model config. All LLM calls for this operator
 * will fall back to the platform default after this call.
 */
export async function clearOperatorModelConfig(operatorId: string): Promise<void> {
  await db
    .update(operatorsTable)
    .set({ modelConfig: null })
    .where(eq(operatorsTable.id, operatorId));
}

// ─── Test ─────────────────────────────────────────────────────────────────────

/**
 * Validate a model config by making a minimal real API call.
 * Does NOT store the config — caller must call setOperatorModelConfig()
 * after a successful test if they want to persist it.
 */
export async function testModelConfig(config: OperatorModelConfig): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const override: ModelOverride = {
    model: config.modelId.trim(),
    apiKey: config.apiKey.trim(),
    baseUrl: config.baseUrl?.trim() || undefined,
    provider: config.provider,
  };

  const start = Date.now();
  try {
    const result = await chatCompletion(
      [{ role: 'user', content: 'Reply with the single word: ok' }],
      { modelOverride: override },
    );
    const latencyMs = Date.now() - start;
    const valid = result.content.toLowerCase().includes('ok') || result.content.trim().length > 0;
    return { ok: valid, latencyMs };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Masked key helper ────────────────────────────────────────────────────────

/**
 * Returns a masked version of an API key for safe display: "sk-...d3f2".
 * Returns undefined if there is no key.
 */
export function maskApiKey(encrypted: string | null | undefined): string | undefined {
  if (!encrypted) return undefined;
  try {
    const raw = decryptToken(encrypted);
    if (raw.length <= 8) return '****';
    return `${raw.slice(0, 3)}...${raw.slice(-4)}`;
  } catch {
    return '****';
  }
}
