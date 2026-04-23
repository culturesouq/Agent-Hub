import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { embed } from '@workspace/opsoul-utils/ai';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  searchBothKbs,
  searchOwnerKb,
  searchOperatorKb,
  buildRagContext,
  KB_TOP_N_CHUNKS,
  KB_RETRIEVAL_MIN_CONFIDENCE,
} from '../utils/vectorSearch.js';
import { eq, and } from 'drizzle-orm';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const SearchSchema = z.object({
  query: z.string().min(1, 'query is required').max(2000),
  topN: z.number().int().min(1).max(20).default(KB_TOP_N_CHUNKS),
  minConfidence: z.number().int().min(0).max(100).default(KB_RETRIEVAL_MIN_CONFIDENCE),
  source: z.enum(['both', 'owner', 'operator']).default('both'),
  includeRagContext: z.boolean().default(false),
});

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId as string),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op.id;
}

router.post('/search', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = SearchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { query, topN, minConfidence, source, includeRagContext } = parsed.data;

  const embedding = await embed(query);

  let hits;
  if (source === 'owner') {
    hits = await searchOwnerKb(operatorId, embedding, topN);
  } else if (source === 'operator') {
    hits = await searchOperatorKb(operatorId, embedding, topN, minConfidence);
  } else {
    hits = await searchBothKbs(operatorId, embedding, topN, minConfidence);
  }

  const response: Record<string, unknown> = {
    operatorId,
    query,
    source,
    topN,
    minConfidence,
    resultCount: hits.length,
    results: hits.map((h) => ({
      id: h.id,
      content: h.content,
      similarity: parseFloat(h.similarity.toFixed(4)),
      kbSource: h.kbSource,
      sourceName: h.sourceName,
      sourceUrl: h.sourceUrl,
      chunkIndex: h.chunkIndex,
      ...(h.kbSource === 'operator' && {
        confidenceScore: h.confidenceScore,
        verificationStatus: h.verificationStatus,
      }),
    })),
  };

  if (includeRagContext) {
    response.ragContext = buildRagContext(hits);
  }

  res.json(response);
});

export default router;
