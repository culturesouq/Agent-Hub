import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db';
import { operatorMemoryTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and, isNull, isNotNull, desc } from 'drizzle-orm';
import { embed } from '@workspace/opsoul-utils/ai';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import {
  MEMORY_TYPES,
  SOURCE_TRUST_LEVELS,
  storeMemory,
  searchMemory,
  distillMemoriesFromConversations,
  decayMemoriesForOperator,
  MEMORY_MIN_SIMILARITY,
  MEMORY_TOP_N,
} from '../utils/memoryEngine.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function resolveOperator(
  req: Request,
  res: Response,
): Promise<{ id: string; name: string; ownerId: string } | null> {
  const [op] = await db
    .select({ id: operatorsTable.id, name: operatorsTable.name, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op;
}

const StoreMemorySchema = z.object({
  content: z.string().min(1).max(4000),
  memoryType: z.enum(MEMORY_TYPES),
  sourceTrustLevel: z.enum(SOURCE_TRUST_LEVELS).default('owner'),
  weight: z.number().min(0).max(1).default(1.0),
  startDecay: z.boolean().default(false),
});

const UpdateMemorySchema = z.object({
  content: z.string().min(1).max(4000).optional(),
  memoryType: z.enum(MEMORY_TYPES).optional(),
  weight: z.number().min(0).max(1).optional(),
  startDecay: z.boolean().optional(),
  unarchive: z.boolean().optional(),
});

const SearchMemorySchema = z.object({
  query: z.string().min(1).max(2000),
  topN: z.number().int().min(1).max(20).default(MEMORY_TOP_N),
  minSimilarity: z.number().min(0).max(1).default(MEMORY_MIN_SIMILARITY),
  minWeight: z.number().min(0).max(1).default(0.1),
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const parsed = StoreMemorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const memory = await storeMemory(
    op.id,
    op.ownerId,
    parsed.data.content,
    parsed.data.memoryType,
    parsed.data.sourceTrustLevel,
    parsed.data.weight,
    parsed.data.startDecay,
  );

  triggerSelfAwareness(op.id, 'kb_learn').catch(() => {});

  res.status(201).json({
    id: memory.id,
    operatorId: memory.operatorId,
    content: memory.content,
    memoryType: memory.memoryType,
    sourceTrustLevel: memory.sourceTrustLevel,
    weight: memory.weight,
    decayStartedAt: memory.decayStartedAt,
    archivedAt: memory.archivedAt,
    createdAt: memory.createdAt,
  });
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const memoryType = req.query.memoryType as string | undefined;
  const includeArchived = req.query.includeArchived === 'true';
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
  const offset = parseInt(String(req.query.offset ?? '0'), 10);

  let baseQuery = db
    .select({
      id: operatorMemoryTable.id,
      content: operatorMemoryTable.content,
      memoryType: operatorMemoryTable.memoryType,
      sourceTrustLevel: operatorMemoryTable.sourceTrustLevel,
      weight: operatorMemoryTable.weight,
      decayStartedAt: operatorMemoryTable.decayStartedAt,
      archivedAt: operatorMemoryTable.archivedAt,
      createdAt: operatorMemoryTable.createdAt,
    })
    .from(operatorMemoryTable)
    .where(eq(operatorMemoryTable.operatorId, op.id))
    .orderBy(desc(operatorMemoryTable.createdAt))
    .limit(limit)
    .offset(offset);

  const conditions = [eq(operatorMemoryTable.operatorId, op.id)];
  if (!includeArchived) conditions.push(isNull(operatorMemoryTable.archivedAt));
  if (memoryType) {
    const safeType = memoryType as typeof MEMORY_TYPES[number];
    conditions.push(eq(operatorMemoryTable.memoryType, safeType));
  }

  const memories = await db
    .select({
      id: operatorMemoryTable.id,
      content: operatorMemoryTable.content,
      memoryType: operatorMemoryTable.memoryType,
      sourceTrustLevel: operatorMemoryTable.sourceTrustLevel,
      weight: operatorMemoryTable.weight,
      decayStartedAt: operatorMemoryTable.decayStartedAt,
      archivedAt: operatorMemoryTable.archivedAt,
      createdAt: operatorMemoryTable.createdAt,
    })
    .from(operatorMemoryTable)
    .where(and(...conditions))
    .orderBy(desc(operatorMemoryTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ operatorId: op.id, count: memories.length, memories });
});

router.get('/:memId', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const [memory] = await db
    .select()
    .from(operatorMemoryTable)
    .where(
      and(
        eq(operatorMemoryTable.id, req.params.memId),
        eq(operatorMemoryTable.operatorId, op.id),
      ),
    );

  if (!memory) { res.status(404).json({ error: 'Memory not found' }); return; }

  const { embedding: _, ...safe } = memory;
  res.json(safe);
});

router.patch('/:memId', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const parsed = UpdateMemorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [existing] = await db
    .select()
    .from(operatorMemoryTable)
    .where(
      and(
        eq(operatorMemoryTable.id, req.params.memId),
        eq(operatorMemoryTable.operatorId, op.id),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Memory not found' }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.memoryType !== undefined) updates.memoryType = parsed.data.memoryType;
  if (parsed.data.weight !== undefined) updates.weight = parsed.data.weight;
  if (parsed.data.startDecay === true && !existing.decayStartedAt) {
    updates.decayStartedAt = new Date();
  }
  if (parsed.data.startDecay === false) updates.decayStartedAt = null;
  if (parsed.data.unarchive === true) {
    updates.archivedAt = null;
    updates.weight = Math.max(parsed.data.weight ?? existing.weight ?? 0.1, 0.1);
  }

  if (parsed.data.content !== undefined && parsed.data.content !== existing.content) {
    updates.content = parsed.data.content;
    const newEmbedding = await embed(parsed.data.content);
    updates.embedding = newEmbedding as unknown as string;
  }

  const [updated] = await db
    .update(operatorMemoryTable)
    .set(updates)
    .where(eq(operatorMemoryTable.id, req.params.memId))
    .returning();

  const { embedding: _, ...safe } = updated;
  res.json(safe);
});

router.delete('/:memId', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const [existing] = await db
    .select({ id: operatorMemoryTable.id })
    .from(operatorMemoryTable)
    .where(
      and(
        eq(operatorMemoryTable.id, req.params.memId),
        eq(operatorMemoryTable.operatorId, op.id),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Memory not found' }); return; }

  await db.delete(operatorMemoryTable).where(eq(operatorMemoryTable.id, req.params.memId));
  res.json({ ok: true, deleted: req.params.memId });
});

router.post('/search', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const parsed = SearchMemorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const embedding = await embed(parsed.data.query);
  const hits = await searchMemory(
    op.id,
    embedding,
    parsed.data.topN,
    parsed.data.minSimilarity,
    parsed.data.minWeight,
  );

  res.json({ operatorId: op.id, query: parsed.data.query, count: hits.length, hits });
});

router.post('/distill', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  try {
    const result = await distillMemoriesFromConversations(op.id, op.ownerId, op.name);
    res.json({
      operatorId: op.id,
      extracted: result.extracted,
      stored: result.stored,
      storedNote: 'Only memories with confidence ≥ 0.7 are stored.',
      memories: result.memories,
    });
  } catch (err) {
    res.status(502).json({ error: 'Distillation failed', detail: (err as Error).message });
  }
});

router.post('/decay', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const result = await decayMemoriesForOperator(op.id);
  res.json({
    operatorId: op.id,
    decayed: result.decayed,
    archived: result.archived,
    note: `Weight reduced by ${0.05} per decaying memory. Archived at weight ≤ 0.05.`,
  });
});

export default router;
