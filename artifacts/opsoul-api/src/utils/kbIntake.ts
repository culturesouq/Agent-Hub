import crypto from 'crypto';
import { pool } from '@workspace/db';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion } from './openrouter.js';

const DISTILL_MODEL = 'meta-llama/llama-3.3-70b-instruct';

const TRUSTED_DOMAINS = ['.gov', '.edu', 'reuters.com', 'bbc.com', 'nature.com', 'who.int'];

export type IntakeStatus = 'verified' | 'pending' | 'skipped';

export interface IntakeResult {
  stored: boolean;
  status: IntakeStatus;
  reason?: string;
}

async function llmCheck(prompt: string): Promise<string> {
  const result = await chatCompletion([{ role: 'user', content: prompt }], DISTILL_MODEL);
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

  // ── Check 1: Relevance ──────────────────────────────────────────────────────
  let relevanceScore = 0;
  try {
    const raw = await llmCheck(
      `Does this content relate to this mandate: "${mandate}"?\nContent: "${content.slice(0, 800)}"\nRespond with only a number between 0 and 100 representing relevance.`,
    );
    const parsed = parseInt(raw.replace(/\D/g, '').slice(0, 3), 10);
    relevanceScore = isNaN(parsed) ? 0 : Math.min(100, parsed);
  } catch {
    relevanceScore = 0;
  }
  if (relevanceScore < 50) {
    return { stored: false, status: 'skipped', reason: `Relevance too low (${relevanceScore}/100)` };
  }

  // ── Check 2: Durability ─────────────────────────────────────────────────────
  try {
    const raw = await llmCheck(
      `Is this fact stable over time, or is it ephemeral (price, today's news, live event)?\nContent: "${content.slice(0, 600)}"\nAnswer only "stable" or "ephemeral".`,
    );
    if (raw.toLowerCase().startsWith('ephemeral')) {
      return { stored: false, status: 'skipped', reason: 'Content is ephemeral (not durable knowledge)' };
    }
  } catch {
    // non-critical — continue
  }

  // ── Check 3: Privacy ────────────────────────────────────────────────────────
  try {
    const raw = await llmCheck(
      `Does this content contain personal identifiable information (names, emails, phone numbers, addresses)?\nContent: "${content.slice(0, 600)}"\nAnswer only "yes" or "no".`,
    );
    if (raw.toLowerCase().startsWith('yes')) {
      return { stored: false, status: 'skipped', reason: 'Content contains PII' };
    }
  } catch {
    // non-critical — continue
  }

  // ── Embed for vector checks ─────────────────────────────────────────────────
  let embedding: number[];
  try {
    embedding = await embed(content);
  } catch {
    return { stored: false, status: 'skipped', reason: 'Embedding failed' };
  }
  const vecStr = `[${embedding.join(',')}]`;

  // ── Check 4: No duplication (similarity > 0.92) ─────────────────────────────
  try {
    const dupResult = await pool.query<{ distance: number }>(
      `SELECT (embedding <=> $1::vector) AS distance
       FROM operator_kb
       WHERE operator_id = $2
         AND embedding IS NOT NULL
       ORDER BY distance ASC
       LIMIT 1`,
      [vecStr, operatorId],
    );
    if (dupResult.rows.length > 0) {
      const similarity = 1 - Number(dupResult.rows[0].distance);
      if (similarity > 0.92) {
        return { stored: false, status: 'skipped', reason: 'Duplicate content already in knowledge base' };
      }
    }
  } catch {
    // non-critical — continue
  }

  // ── Check 5: Contradiction detection (similarity > 0.85 with verified entry) ─
  let flagReason: string | null = null;
  try {
    const contradictResult = await pool.query<{ distance: number; verification_status: string }>(
      `SELECT (embedding <=> $1::vector) AS distance, verification_status
       FROM operator_kb
       WHERE operator_id = $2
         AND embedding IS NOT NULL
         AND verification_status = 'verified'
       ORDER BY distance ASC
       LIMIT 1`,
      [vecStr, operatorId],
    );
    if (contradictResult.rows.length > 0) {
      const similarity = 1 - Number(contradictResult.rows[0].distance);
      if (similarity > 0.85) {
        flagReason = 'Possible contradiction with existing knowledge';
      }
    }
  } catch {
    // non-critical — continue
  }

  // ── Check 6: Confidence score (independent from relevance) ─────────────────
  let factualConfidence = 0;
  try {
    const raw = await llmCheck(
      `How factually confident are you in this content? Is it specific, verifiable, and well-grounded?\nContent: "${content.slice(0, 600)}"\nRespond with only a number between 0 and 100.`
    );
    const parsed = parseInt(raw.replace(/\D/g, '').slice(0, 3), 10);
    factualConfidence = isNaN(parsed) ? 0 : Math.min(100, parsed);
  } catch {
    factualConfidence = relevanceScore; // fallback only if LLM call fails
  }

  // Final confidence = average of relevance + factual confidence
  const confidenceScore = Math.round((relevanceScore + factualConfidence) / 2);
  if (confidenceScore < 60) {
    return { stored: false, status: 'skipped', reason: `Confidence too low (${confidenceScore}/100)` };
  }
  const verificationStatus: 'verified' | 'pending' =
    confidenceScore >= 85 && !flagReason ? 'verified' : 'pending';

  // ── Check 7: Source trust ───────────────────────────────────────────────────
  const sourceTrustLevel = TRUSTED_DOMAINS.some((d) => sourceUrl.includes(d))
    ? 'external_verified'
    : 'external_unverified';

  // ── Store ───────────────────────────────────────────────────────────────────
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
      sourceName || null,
      sourceUrl || null,
      sourceTrustLevel,
      confidenceScore,
      [],
      false,
      true,
      true,
      verificationStatus,
      0,
      flagReason,
    ],
  );

  return { stored: true, status: verificationStatus };
}
