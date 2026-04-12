import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { operatorMemoryTable, operatorsTable } from '@workspace/db-v2';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { embed } from '@workspace/opsoul-utils/ai';
import {
  MEMORY_TYPES,
  SOURCE_TRUST_LEVELS,
  storeMemory,
  searchMemory,
  distillMemoriesFromConversations,
  MEMORY_MIN_SIMILARITY,
  MEMORY_TOP_N,
} from '../utils/memoryEngine.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';

const router = Router({ mergeParams: true });

async function resolveOperator(req: Request, res: Response): Promise<{ id: string; name: string; ownerId: string } | null> {
  const [op] = await db.select({ id: operatorsTable.id, name: operatorsTable.name, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return null; }
  return op;
}

const StoreMemorySchema = z.object({
  content: z.string().min(1).max(4000),
  memoryType: z.enum(MEMORY_TYPES),
  sourceTrustLevel: z.enum(SOURCE_TRUST_LEVELS).default('owner'),
  weight: z.number().min(0).max(1).default(1.0),
});

const SearchMemorySchema = z.object({
  query: z.string().min(1).max(2000),
  topN: z.number().int().min(1).max(20).default(MEMORY_TOP_N),
  minSimilarity: z.number().min(0).max(1).default(MEMORY_MIN_SIMILARITY),
  minWeight: z.number().min(0).max(1).default(0.1),
});

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const includeArchived = req.query.includeArchived === 'true';
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

  const where = includeArchived
    ? eq(operatorMemoryTable.operatorId, op.id)
    : and(eq(operatorMemoryTable.operatorId, op.id), isNull(operatorMemoryTable.archivedAt));

  const memories = await db.select({
    id: operatorMemoryTable.id,
    content: operatorMemoryTable.content,
    memoryType: operatorMemoryTable.memoryType,
    sourceTrustLevel: operatorMemoryTable.sourceTrustLevel,
    weight: operatorMemoryTable.weight,
    decayStartedAt: operatorMemoryTable.decayStartedAt,
    archivedAt: operatorMemoryTable.archivedAt,
    createdAt: operatorMemoryTable.createdAt,
  }).from(operatorMemoryTable).where(where).orderBy(desc(operatorMemoryTable.createdAt)).limit(limit);

  res.json({ operatorId: op.id, count: memories.length, memories });
});

// ── Store ─────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const parsed = StoreMemorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const { content, memoryType, sourceTrustLevel, weight } = parsed.data;
  const id = await storeMemory(op.id, op.ownerId, content, memoryType, sourceTrustLevel, weight);

  const [stored] = await db.select({
    id: operatorMemoryTable.id,
    content: operatorMemoryTable.content,
    memoryType: operatorMemoryTable.memoryType,
    sourceTrustLevel: operatorMemoryTable.sourceTrustLevel,
    weight: operatorMemoryTable.weight,
    createdAt: operatorMemoryTable.createdAt,
  }).from(operatorMemoryTable).where(eq(operatorMemoryTable.id, id));

  triggerSelfAwareness(op.id, 'kb_learn');
  res.status(201).json(stored);
});

// ── Search ────────────────────────────────────────────────────────────────────

router.post('/search', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const parsed = SearchMemorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const { query, topN, minSimilarity, minWeight } = parsed.data;
  const embedding = await embed(query);
  const hits = await searchMemory(op.id, embedding, topN, minSimilarity, minWeight);
  res.json({ operatorId: op.id, query, count: hits.length, hits });
});

// ── Distill from conversations ────────────────────────────────────────────────

router.post('/distill', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  try {
    await distillMemoriesFromConversations(op.id, op.ownerId, op.name);
    res.json({ ok: true, message: 'Distillation complete. New memories stored.' });
  } catch (err) {
    res.status(502).json({ error: 'Distillation failed', detail: (err as Error).message });
  }
});

// ── Archive (soft delete) ─────────────────────────────────────────────────────

router.delete('/:memoryId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  await db.update(operatorMemoryTable).set({ archivedAt: new Date() })
    .where(and(eq(operatorMemoryTable.id, req.params.memoryId), eq(operatorMemoryTable.operatorId, op.id)));
  res.json({ ok: true });
});

export default router;
