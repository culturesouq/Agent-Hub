import crypto from 'crypto';
import { db, pool } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { isNull } from 'drizzle-orm';
import { embed } from '@workspace/opsoul-utils/ai';

const AGENCY_CORE_SOURCE = '_agency-core';

// Owner direction 2026-05-14: "Hide it, all of it, I want them just work on it."
// Agency Core now lists tool NAMES + brief PURPOSES only. Workspace mechanics
// (knowledge base internals, memory store, integration descriptions) removed.
// Operators USE their tools; they do not READ a manual about the workspace.
// Tool invocation mechanics (e.g., preceding-text suppresses tool calls) and
// schema details remain in the chat route's tool definition (where they belong
// for the LLM to understand the function-call contract), not in identity KB.
export const AGENCY_CORE_CONTENT = `My tools:

- http_request — call external APIs.
- web_search — search the web for current information.
- write_file — save a file to my workspace.
- read_file — read a file from my workspace.
- list_files — see what files I have.
- kb_seed — add knowledge worth keeping to my memory.
- get_current_time — check the current time in any timezone.
- schedule_task / update_task / pause_task / resume_task / delete_task — manage my own recurring tasks.

I use these naturally as part of my work.
`;

export async function seedAgencyCore(operatorId: string, ownerId: string): Promise<void> {
  const { rows: existing } = await pool.query<{ id: string }>(
    `SELECT id FROM operator_kb WHERE operator_id = $1 AND source_name = $2 LIMIT 1`,
    [operatorId, AGENCY_CORE_SOURCE],
  );

  if (existing.length > 0) return;

  const embedding = await embed(AGENCY_CORE_CONTENT.slice(0, 30000));
  const vecStr = `[${embedding.join(',')}]`;
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO operator_kb
       (id, operator_id, owner_id, content, embedding, source_name,
        source_trust_level, confidence_score, intake_tags, is_pipeline_intake,
        privacy_cleared, content_cleared, is_system, verification_status, chunk_index, created_at)
     VALUES ($1,$2,$3,$4,$5::vector,$6,'operator_self',95,'{}',false,true,true,true,'verified',0,NOW())`,
    [id, operatorId, ownerId, AGENCY_CORE_CONTENT, vecStr, AGENCY_CORE_SOURCE],
  );

  console.log(`[agency-core] seeded for operator ${operatorId}`);
}

// Bumped whenever AGENCY_CORE_CONTENT changes. Drives the versioned reseed
// in backfillAllAgencyCore — operators carrying an older version get fresh
// content; operators already at the current version are skipped.
export const AGENCY_CORE_VERSION = '2026-05-14-tools-only';

export async function reseedAgencyCore(operatorId: string, ownerId: string): Promise<void> {
  await pool.query(
    `DELETE FROM operator_kb WHERE operator_id = $1 AND source_name = $2`,
    [operatorId, AGENCY_CORE_SOURCE],
  );
  await seedAgencyCore(operatorId, ownerId);
  // Stamp the version onto the freshly-inserted chunk so the next boot sees
  // it as up-to-date.
  await pool.query(
    `UPDATE operator_kb
     SET intake_tags = ARRAY[$3]::text[]
     WHERE operator_id = $1 AND source_name = $2`,
    [operatorId, AGENCY_CORE_SOURCE, `v:${AGENCY_CORE_VERSION}`],
  );
}

export async function backfillAllAgencyCore(): Promise<void> {
  const operators = await db
    .select({ id: operatorsTable.id, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(isNull(operatorsTable.deletedAt));

  let reseeded = 0;
  let seeded = 0;
  let upToDate = 0;

  for (const op of operators) {
    try {
      const { rows } = await pool.query<{ intake_tags: string[] | null }>(
        `SELECT intake_tags FROM operator_kb
         WHERE operator_id = $1 AND source_name = $2
         LIMIT 1`,
        [op.id, AGENCY_CORE_SOURCE],
      );

      if (rows.length === 0) {
        await seedAgencyCore(op.id, op.ownerId);
        await pool.query(
          `UPDATE operator_kb
           SET intake_tags = ARRAY[$3]::text[]
           WHERE operator_id = $1 AND source_name = $2`,
          [op.id, AGENCY_CORE_SOURCE, `v:${AGENCY_CORE_VERSION}`],
        );
        seeded++;
        continue;
      }

      const currentVersion = rows[0]?.intake_tags?.find(t => t.startsWith('v:')) ?? null;
      const targetTag = `v:${AGENCY_CORE_VERSION}`;

      if (currentVersion === targetTag) {
        upToDate++;
        continue;
      }

      await reseedAgencyCore(op.id, op.ownerId);
      reseeded++;
    } catch (err: any) {
      console.error(`[agency-core] backfill failed for ${op.id}:`, err.message);
    }
  }

  console.log(
    `[agency-core] backfill complete — ${seeded} new seeded, ${reseeded} reseeded, ${upToDate} already at ${AGENCY_CORE_VERSION}`,
  );
}
