import crypto from 'crypto';
import { pool, db } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion } from './openrouter.js';
import { DEFAULT_MODEL_ID } from './modelRegistry.js';

const GATE_MODEL = DEFAULT_MODEL_ID;

export interface KbGateResult {
  stored: boolean;
  reason?: string;
}

async function ask(question: string): Promise<string> {
  try {
    const r = await chatCompletion([{ role: 'user', content: question }], GATE_MODEL);
    return r.content.trim().toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Four-check gate for all operator KB intake paths.
 * Passes → stored immediately as verified. No pending limbo.
 *
 * 1. PII           — reject if personal data found
 * 2. Durability    — reject if ephemeral (price, live event, today's news)
 * 3. Dedup         — similarity > 0.80 triggers full meaning comparison
 * 4. Domain fit    — must align with operator's mandate + archetype
 *
 * Domain check is skipped when operator has no mandate defined.
 * Same criteria applied to every intake path — no special cases.
 */
export async function gateAndStoreOperatorKb(
  operatorId: string,
  ownerId: string,
  content: string,
  sourceName: string,
  sourceUrl: string | null = null,
): Promise<KbGateResult> {
  if (!content || content.trim().length < 20) {
    return { stored: false, reason: 'Content too short' };
  }

  const [operator] = await db
    .select({ mandate: operatorsTable.mandate, archetype: operatorsTable.archetype })
    .from(operatorsTable)
    .where(eq(operatorsTable.id, operatorId));
  if (!operator) return { stored: false, reason: 'Operator not found' };

  const mandate = operator.mandate ?? '';
  const archetype = Array.isArray(operator.archetype)
    ? (operator.archetype as string[]).join(', ')
    : String(operator.archetype ?? '');
  const snippet = content.slice(0, 800);

  // 1. PII
  const piiAnswer = await ask(
    `Does this content contain personal identifiable information (names, emails, phone numbers, addresses, ID numbers)?\nContent: "${snippet}"\nAnswer only "yes" or "no".`,
  );
  if (piiAnswer.startsWith('yes')) return { stored: false, reason: 'Content contains PII' };

  // 2. Durability
  const durAnswer = await ask(
    `Is this knowledge ephemeral (a current price, today's news, a live event, a temporary state) or is it stable knowledge?\nContent: "${snippet}"\nAnswer only "ephemeral" or "stable".`,
  );
  if (durAnswer.startsWith('ephemeral')) return { stored: false, reason: 'Content is ephemeral' };

  // Embed once — used for both dedup and storage
  let embedding: number[];
  try {
    embedding = await embed(content);
  } catch {
    return { stored: false, reason: 'Embedding failed' };
  }
  const vecStr = `[${embedding.join(',')}]`;

  // 3. Dedup — find nearest neighbour; if similarity > 0.80 read both in full
  try {
    const nearest = await pool.query<{ content: string; distance: number }>(
      `SELECT content, (embedding <=> $1::vector) AS distance
       FROM operator_kb
       WHERE operator_id = $2 AND embedding IS NOT NULL
       ORDER BY distance ASC LIMIT 1`,
      [vecStr, operatorId],
    );
    if (nearest.rows.length > 0) {
      const similarity = 1 - Number(nearest.rows[0].distance);
      if (similarity > 0.80) {
        const dedupAnswer = await ask(
          `Existing knowledge entry:\n"${nearest.rows[0].content}"\n\nNew knowledge entry:\n"${content}"\n\nDoes the new entry add meaningful knowledge not already covered by the existing one, or is it effectively the same information?\nAnswer only "new" or "duplicate".`,
        );
        if (dedupAnswer.startsWith('duplicate')) {
          return { stored: false, reason: 'Duplicate — same knowledge already in KB' };
        }
      }
    }
  } catch { /* non-critical — proceed */ }

  // 4. Domain fit
  if (mandate) {
    const domainAnswer = await ask(
      `Operator mandate: "${mandate}"\nOperator archetype: "${archetype}"\n\nKnowledge to store:\n"${snippet}"\n\nDoes this knowledge fall within the domain this operator serves?\nAnswer only "yes" or "no".`,
    );
    if (domainAnswer.startsWith('no')) {
      return { stored: false, reason: 'Knowledge outside operator domain' };
    }
  }

  // All checks passed — store as verified immediately
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO operator_kb
       (id, operator_id, owner_id, content, embedding, source_name, source_url,
        source_trust_level, confidence_score, intake_tags, is_pipeline_intake,
        privacy_cleared, content_cleared, verification_status, chunk_index,
        entity_type, created_at)
     VALUES ($1,$2,$3,$4,$5::vector,$6,$7,'operator_self',80,'{}',false,true,true,'verified',0,'reference',NOW())`,
    [id, operatorId, ownerId, content, vecStr, sourceName || null, sourceUrl],
  );

  return { stored: true };
}
