import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db-v2';
import { operatorKbTable, ownerKbTable } from '@workspace/db-v2';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';

const router = Router({ mergeParams: true });

router.get('/operator-kb', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const entries = await db.select({
    id: operatorKbTable.id,
    content: operatorKbTable.content,
    confidenceScore: operatorKbTable.confidenceScore,
    verificationStatus: operatorKbTable.verificationStatus,
    sourceName: operatorKbTable.sourceName,
    sourceUrl: operatorKbTable.sourceUrl,
    sourceTrustLevel: operatorKbTable.sourceTrustLevel,
    isPipelineIntake: operatorKbTable.isPipelineIntake,
    createdAt: operatorKbTable.createdAt,
  }).from(operatorKbTable)
    .where(eq(operatorKbTable.operatorId, operatorId))
    .orderBy(desc(operatorKbTable.createdAt));
  res.json(entries);
});

router.post('/owner-kb', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const { content, sourceName, sourceUrl } = req.body as { content?: string; sourceName?: string; sourceUrl?: string };
  if (!content?.trim()) { res.status(400).json({ error: 'content required' }); return; }

  let embedding: number[] | null = null;
  try {
    embedding = await embed(content);
  } catch {
    // non-fatal — entry created without embedding, won't be retrievable in RAG until embedded
  }

  const id = crypto.randomUUID();
  const [entry] = await db.insert(ownerKbTable).values({
    id,
    operatorId,
    ownerId: req.owner!.ownerId,
    content,
    embedding: embedding ?? null,
    sourceName: sourceName ?? null,
    sourceUrl: sourceUrl ?? null,
  }).returning();
  res.status(201).json(entry);
});

router.get('/owner-kb', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const entries = await db.select({
    id: ownerKbTable.id,
    content: ownerKbTable.content,
    sourceName: ownerKbTable.sourceName,
    sourceUrl: ownerKbTable.sourceUrl,
    createdAt: ownerKbTable.createdAt,
  }).from(ownerKbTable)
    .where(eq(ownerKbTable.operatorId, operatorId))
    .orderBy(desc(ownerKbTable.createdAt));
  res.json(entries);
});

router.post('/kb/search', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const { query, topN = 8, minConfidence = 30 } = req.body as {
    query?: string;
    topN?: number;
    minConfidence?: number;
  };

  if (!query?.trim()) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  let embedding: number[];
  try {
    embedding = await embed(query);
  } catch (err) {
    res.status(500).json({ error: 'Failed to embed query', detail: (err as Error).message });
    return;
  }

  const hits = await searchBothKbs(operatorId, embedding, topN, minConfidence);
  const context = buildRagContext(hits);

  res.json({ hits, context });
});

router.delete('/operator-kb/:entryId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, entryId } = req.params as { operatorId: string; entryId: string };
  await db.delete(operatorKbTable).where(and(eq(operatorKbTable.id, entryId), eq(operatorKbTable.operatorId, operatorId)));
  res.json({ ok: true });
});

router.delete('/owner-kb/:entryId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, entryId } = req.params as { operatorId: string; entryId: string };
  await db.delete(ownerKbTable).where(and(eq(ownerKbTable.id, entryId), eq(ownerKbTable.operatorId, operatorId)));
  res.json({ ok: true });
});

export default router;
