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
  kbSource: 'owner' | 'operator' | 'dna';
  confidenceScore?: number;
  verificationStatus?: string;
}

export const KB_TOP_N_CHUNKS = 8;
export const KB_RETRIEVAL_MIN_CONFIDENCE = 30;

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
     ORDER BY distance ASC
     LIMIT $4`,
    [vecStr, operatorId, minConfidence, limit],
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

export async function searchDnaKb(
  archetypes: string[],
  embedding: number[],
  limit: number = 4,
): Promise<VectorHit[]> {
  const vecStr = `[${embedding.join(',')}]`;

  const archetypePlaceholders = archetypes.map((_, i) => `$${i + 3}`).join(', ');
  const archetypeClause = archetypes.length > 0
    ? `AND (layer = 'builder' OR layer = 'collective' OR (layer = 'archetype' AND archetype IN (${archetypePlaceholders})))`
    : `AND (layer = 'builder' OR layer = 'collective')`;

  const result = await pool.query<{
    id: string;
    content: string;
    layer: string;
    source_name: string | null;
    confidence: number | null;
    distance: number;
  }>(
    `SELECT id, content, layer, source_name, confidence,
            (embedding <=> $1::vector) AS distance
     FROM rag_dna
     WHERE is_active = true
       AND embedding IS NOT NULL
       AND (embedding <=> $1::vector) < $2
       ${archetypeClause}
     ORDER BY distance ASC
     LIMIT ${limit}`,
    [vecStr, 0.88, ...archetypes],
  );

  return result.rows.map((r) => ({
    id: r.id,
    content: r.content,
    sourceUrl: null,
    sourceName: r.source_name ?? `dna:${r.layer}`,
    sourceType: `dna:${r.layer}`,
    chunkIndex: null,
    distance: Number(r.distance),
    similarity: 1 - Number(r.distance),
    kbSource: 'dna' as const,
  }));
}

export async function searchBothKbs(
  operatorId: string,
  embedding: number[],
  topN: number = KB_TOP_N_CHUNKS,
  minConfidence: number = KB_RETRIEVAL_MIN_CONFIDENCE,
  archetypes: string[] = [],
): Promise<VectorHit[]> {
  const [ownerHits, operatorHits, dnaHits] = await Promise.all([
    searchOwnerKb(operatorId, embedding, topN),
    searchOperatorKb(operatorId, embedding, topN, minConfidence),
    searchDnaKb(archetypes, embedding, 4),
  ]);

  const merged = [...ownerHits, ...operatorHits, ...dnaHits];
  merged.sort((a, b) => a.distance - b.distance);
  return merged.slice(0, topN);
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
