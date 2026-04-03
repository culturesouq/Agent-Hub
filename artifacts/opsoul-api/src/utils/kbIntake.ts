import crypto from 'crypto';
import { pool } from '@workspace/db';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion } from './openrouter.js';
import { curiositySearch } from './curiosityEngine.js';

const DISTILL_MODEL = 'meta-llama/llama-3.3-70b-instruct';

export type IntakeStatus = 'verified' | 'pending' | 'skipped';

export interface IntakeResult {
  stored: boolean;
  status: IntakeStatus;
  reason?: string;
}

async function llmCheck(prompt: string): Promise<string> {
  const result = await chatCompletion(
    [{ role: 'user', content: prompt }],
    DISTILL_MODEL,
  );
  return result.content.trim();
}

export async function verifyAndStore(
  operatorId: string,
  ownerId: string,
  content: string,
  sourceUrl: string,
  sourceName: string,
  mandate: string,
): Promise<IntakeResult> {

  // Check 1: Durability — cheapest check first, no LLM knowledge scoring
  try {
    const raw = await llmCheck(
      `Is this fact stable over time, or is it ephemeral (price, today's news, live event)?\nContent: "${content.slice(0, 600)}"\nAnswer only "stable" or "ephemeral".`,
    );
    if (raw.toLowerCase().startsWith('ephemeral')) {
      return { stored: false, status: 'skipped', reason: 'Content is ephemeral' };
    }
  } catch { /* non-critical */ }

  // Check 2: Privacy
  try {
    const raw = await llmCheck(
      `Does this content contain personal identifiable information (names, emails, phone numbers, addresses)?\nContent: "${content.slice(0, 600)}"\nAnswer only "yes" or "no".`,
    );
    if (raw.toLowerCase().startsWith('yes')) {
      return { stored: false, status: 'skipped', reason: 'Content contains PII' };
    }
  } catch { /* non-critical */ }

  // Embed for vector checks
  let embedding: number[];
  try {
    embedding = await embed(content);
  } catch {
    return { stored: false, status: 'skipped', reason: 'Embedding failed' };
  }
  const vecStr = `[${embedding.join(',')}]`;

  // Check 3: No duplication (similarity > 0.92)
  try {
    const dupResult = await pool.query<{ distance: number }>(
      `SELECT (embedding <=> $1::vector) AS distance
       FROM operator_kb
       WHERE operator_id = $2 AND embedding IS NOT NULL
       ORDER BY distance ASC LIMIT 1`,
      [vecStr, operatorId],
    );
    if (dupResult.rows.length > 0 && (1 - Number(dupResult.rows[0].distance)) > 0.92) {
      return { stored: false, status: 'skipped', reason: 'Duplicate content already in knowledge base' };
    }
  } catch { /* non-critical */ }

  // Check 4: Contradiction detection
  let flagReason: string | null = null;
  try {
    const contradictResult = await pool.query<{ distance: number }>(
      `SELECT (embedding <=> $1::vector) AS distance
       FROM operator_kb
       WHERE operator_id = $2 AND embedding IS NOT NULL AND verification_status = 'verified'
       ORDER BY distance ASC LIMIT 1`,
      [vecStr, operatorId],
    );
    if (contradictResult.rows.length > 0 && (1 - Number(contradictResult.rows[0].distance)) > 0.85) {
      flagReason = 'Possible contradiction with existing knowledge';
    }
  } catch { /* non-critical */ }

  // Check 5: Source trust via curiositySearch
  // We NEVER score from LLM memory. We always go to the real world.
  const searchClaim = mandate
    ? `${content.slice(0, 300)} related to: ${mandate.slice(0, 100)}`
    : content.slice(0, 300);

  const curiosity = await curiositySearch(searchClaim, operatorId, mandate);

  // No trusted source found (Tier 1 or 2 required)
  if (!curiosity.tier) {
    return { stored: false, status: 'skipped', reason: 'No trusted external source found' };
  }

  // Single source only — corroboration required
  if (!curiosity.corroborated) {
    return { stored: false, status: 'skipped', reason: 'Single source only — corroboration required' };
  }

  // All checks passed — store at score 40, status always pending
  // Nothing enters as verified automatically. Ever.
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO operator_kb
       (id, operator_id, owner_id, content, embedding, source_name, source_url,
        source_trust_level, confidence_score, intake_tags, is_pipeline_intake,
        privacy_cleared, content_cleared, verification_status, chunk_index,
        flag_reason, created_at)
     VALUES ($1,$2,$3,$4,$5::vector,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())`,
    [
      id,
      operatorId,
      ownerId,
      content,
      vecStr,
      sourceName || curiosity.bestSource || null,
      sourceUrl || curiosity.bestSource || null,
      curiosity.tier === 1 || curiosity.tier === 2 ? 'external_verified' : 'external_unverified',
      40,
      [],
      false,
      true,
      true,
      'pending',
      0,
      flagReason,
    ],
  );

  return { stored: true, status: 'pending' };
}
