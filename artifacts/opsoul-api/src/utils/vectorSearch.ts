import { pool } from '@workspace/db';

export interface VectorHit {
  id: string;
  content: string;
  sourceUrl: string | null;
  sourceName: string | null;
  sourceType: string | null;
  chunkIndex: number | null;
  distance: number;
  similarity: number;
  kbSource: 'owner' | 'operator';
  confidenceScore?: number;
  verificationStatus?: string;
}

export const KB_TOP_N_CHUNKS = 8;
// Confidence floor for KB retrieval. Raised from 30 → 75 (2026-05-24 evening,
// owner direction) so unverified / pending entries (40-confidence default from
// curiosity ingestion or pending review) never surface in operator context.
// Anything below 75 stays in the table for review but does not feed retrieval.
export const KB_RETRIEVAL_MIN_CONFIDENCE = 75;

export async function searchOwnerKb(
  operatorId: string,
  embedding: number[],
  limit: number = KB_TOP_N_CHUNKS,
): Promise<VectorHit[]> {
  const vecStr = `[${embedding.join(',')}]`;

  const result = await pool.query<{
    id: string;
    content: string;
    source_url: string | null;
    source_name: string | null;
    source_type: string | null;
    chunk_index: number | null;
    distance: number;
  }>(
    `SELECT id, content, source_url, source_name, source_type, chunk_index,
            (embedding <=> $1::vector) AS distance
     FROM owner_kb
     WHERE operator_id = $2
       AND embedding IS NOT NULL
       AND (embedding <=> $1::vector) < 0.85
     ORDER BY distance ASC
     LIMIT $3`,
    [vecStr, operatorId, limit],
  );

  return result.rows.map((r) => ({
    id: r.id,
    content: r.content,
    sourceUrl: r.source_url,
    sourceName: r.source_name,
    sourceType: r.source_type,
    chunkIndex: r.chunk_index,
    distance: Number(r.distance),
    similarity: 1 - Number(r.distance),
    kbSource: 'owner',
  }));
}

// Source-name patterns excluded from user-facing chat retrieval.
// These entries describe internal architecture (DNA layer scoping, screener
// pipeline, etc.) seeded into Vael for her DNA-governance work. They must
// never surface to a user-facing response — Architecture-as-Secret (§4).
// Vael's internal validation calls bypass this filter via a separate code
// path (queries operator_kb directly without going through searchOperatorKb).
const ARCHITECTURE_KB_PATTERN = 'Platform Architecture — %';

export async function searchOperatorKb(
  operatorId: string,
  embedding: number[],
  limit: number = KB_TOP_N_CHUNKS,
  minConfidence: number = KB_RETRIEVAL_MIN_CONFIDENCE,
): Promise<VectorHit[]> {
  const vecStr = `[${embedding.join(',')}]`;

  const result = await pool.query<{
    id: string;
    content: string;
    source_url: string | null;
    source_name: string | null;
    chunk_index: number | null;
    confidence_score: number;
    verification_status: string;
    distance: number;
  }>(
    `SELECT id, content, source_url, source_name, chunk_index,
            confidence_score, verification_status,
            (embedding <=> $1::vector) AS distance
     FROM operator_kb
     WHERE operator_id = $2
       AND embedding IS NOT NULL
       AND confidence_score >= $3
       AND verification_status != 'blocked'
       AND (source_name IS NULL OR source_name NOT LIKE $5)
     ORDER BY distance ASC
     LIMIT $4`,
    [vecStr, operatorId, minConfidence, limit, ARCHITECTURE_KB_PATTERN],
  );

  return result.rows.map((r) => ({
    id: r.id,
    content: r.content,
    sourceUrl: r.source_url,
    sourceName: r.source_name,
    sourceType: null,
    chunkIndex: r.chunk_index,
    distance: Number(r.distance),
    similarity: 1 - Number(r.distance),
    kbSource: 'operator',
    confidenceScore: r.confidence_score,
    verificationStatus: r.verification_status,
  }));
}

// ── DNA injection with archetype + domain scoping ────────────────────────────
//
// builder entries      → all operators, always
// archetype entries    → operators whose archetype array includes this entry's archetype
// collective/general   → archetypeScope is empty (universal) OR overlaps operator archetypes
export async function searchBothKbs(
  operatorId: string,
  embedding: number[],
  topN: number = KB_TOP_N_CHUNKS,
  minConfidence: number = KB_RETRIEVAL_MIN_CONFIDENCE,
  _archetypes: string[] = [],
  _domainTags: string[] = [],
): Promise<VectorHit[]> {
  const [ownerHits, operatorHits] = await Promise.all([
    searchOwnerKb(operatorId, embedding, topN),
    searchOperatorKb(operatorId, embedding, topN, minConfidence),
  ]);

  const merged = [...ownerHits, ...operatorHits];
  merged.sort((a, b) => a.distance - b.distance);
  return merged.slice(0, topN);
}

export interface SkillHit {
  id: string;
  name: string;
  instructions: string;
  outputFormat: string | null;
  triggerDescription: string;
  similarity: number;
}

// Vector search against the full platform skill catalog.
// Embedding computed once upstream (reused from KB/memory search) — one DB query.
// Returns up to `limit` skills within distanceThreshold; empty array when none match.
export async function searchSkillByVector(
  embedding: number[],
  distanceThreshold: number = 0.55,
  limit: number = 3,
): Promise<SkillHit[]> {
  const vecStr = `[${embedding.join(',')}]`;

  const result = await pool.query<{
    id: string;
    name: string;
    instructions: string;
    output_format: string | null;
    trigger_description: string;
    distance: number;
  }>(
    `SELECT id, name, instructions, output_format, trigger_description,
            (embedding <=> $1::vector) AS distance
     FROM platform_skills
     WHERE embedding IS NOT NULL
       AND (embedding <=> $1::vector) < $2
     ORDER BY distance ASC
     LIMIT $3`,
    [vecStr, distanceThreshold, limit],
  );

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    outputFormat: row.output_format,
    triggerDescription: row.trigger_description,
    similarity: 1 - Number(row.distance),
  }));
}

export function buildRagContext(hits: VectorHit[]): string {
  if (hits.length === 0) return '';
  return hits
    .map((h, i) => {
      const src = h.sourceName ?? h.sourceUrl ?? h.kbSource;
      return `[${i + 1}] (source: ${src}, similarity: ${(h.similarity * 100).toFixed(1)}%)\n${h.content}`;
    })
    .join('\n\n---\n\n');
}
