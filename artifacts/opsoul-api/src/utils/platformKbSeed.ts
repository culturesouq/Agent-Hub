import { pool } from '@workspace/db';
import { db, operatorsTable } from '@workspace/db';
import { isNull } from 'drizzle-orm';
import { embed } from '@workspace/opsoul-utils/ai';
import { PLATFORM_KB_V1 } from '../scripts/platformKbV1Data.js';

const PLATFORM_KB_SOURCE = '_platform-kb';

export async function seedPlatformKb(operatorId: string, ownerId: string): Promise<void> {
  const entries = PLATFORM_KB_V1;

  const embeddings = await Promise.all(
    entries.map(entry => embed(entry.content)),
  );

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    const vecStr = `[${embeddings[idx].join(',')}]`;
    const id = entry.id
      ? `plat-${entry.id.toLowerCase()}-${operatorId}`
      : `plat-${String(idx).padStart(3, '0')}-${operatorId}`;

    await pool.query(
      `INSERT INTO operator_kb
         (id, operator_id, owner_id, content, embedding, source_name,
          source_trust_level, confidence_score, intake_tags, is_pipeline_intake,
          privacy_cleared, content_cleared, is_system, verification_status, chunk_index, created_at)
       VALUES ($1,$2,$3,$4,$5::vector,$6,'platform',95,'{}',false,true,true,true,'active',$7,NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, operatorId, ownerId, entry.content, vecStr, PLATFORM_KB_SOURCE, idx],
    );
  }

  console.log(`[platformKbSeed] seeded ${entries.length} entries for operator ${operatorId}`);
}

// Re-seed from the current PLATFORM_KB_V1 source file. Deletes the operator's
// existing _platform-kb chunks before inserting the current set. Used after a
// content rewrite to propagate updates to operators born under the prior
// content version.
export async function reseedPlatformKb(operatorId: string, ownerId: string): Promise<void> {
  await pool.query(
    `DELETE FROM operator_kb WHERE operator_id = $1 AND source_name = $2`,
    [operatorId, PLATFORM_KB_SOURCE],
  );
  await seedPlatformKb(operatorId, ownerId);
}

// Boot-time idempotent backfill. Runs once per code-version per operator —
// driven by a content version marker in the operator's _platform-kb chunks.
// When the version stored in the DB differs from PLATFORM_KB_VERSION, the
// operator's chunks are reseeded.
export const PLATFORM_KB_VERSION = '2026-05-14-knowledge-only';

export async function backfillAllPlatformKb(): Promise<void> {
  const operators = await db
    .select({ id: operatorsTable.id, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(isNull(operatorsTable.deletedAt));

  let reseeded = 0;
  let upToDate = 0;

  for (const op of operators) {
    try {
      const { rows } = await pool.query<{ intake_tags: string[] | null }>(
        `SELECT intake_tags FROM operator_kb
         WHERE operator_id = $1 AND source_name = $2
         LIMIT 1`,
        [op.id, PLATFORM_KB_SOURCE],
      );

      const currentVersion = rows[0]?.intake_tags?.find(t => t.startsWith('v:')) ?? null;
      const targetTag = `v:${PLATFORM_KB_VERSION}`;

      if (currentVersion === targetTag) {
        upToDate++;
        continue;
      }

      await reseedPlatformKb(op.id, op.ownerId);

      // Stamp the version onto the freshly-inserted chunks so the next boot
      // sees them as up-to-date and skips the work.
      await pool.query(
        `UPDATE operator_kb
         SET intake_tags = ARRAY[$3]::text[]
         WHERE operator_id = $1 AND source_name = $2`,
        [op.id, PLATFORM_KB_SOURCE, targetTag],
      );

      reseeded++;
    } catch (err: any) {
      console.error(`[platformKbSeed] backfill failed for ${op.id}:`, err.message);
    }
  }

  console.log(
    `[platformKbSeed] backfill complete — ${reseeded} reseeded, ${upToDate} already at ${PLATFORM_KB_VERSION}`,
  );
}
