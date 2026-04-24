import { pool } from '@workspace/db';
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
