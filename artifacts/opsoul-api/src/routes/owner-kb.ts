import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db, pool } from '@workspace/db';
import { ownerKbTable, operatorsTable } from '@workspace/db';
import { embed } from '@workspace/opsoul-utils/ai';
import { requireAuth } from '../middleware/requireAuth.js';
import { chunkText } from '../utils/chunker.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { eq, and } from 'drizzle-orm';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const IngestSchema = z.object({
  text: z.string().min(10, 'text must be at least 10 characters'),
  sourceName: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  sourceType: z.enum(['manual', 'url', 'file', 'pipeline']).default('manual'),
});

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
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
  return op.id;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = IngestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { text, sourceName, sourceUrl, sourceType } = parsed.data;

  const chunks = chunkText(text);

  if (chunks.length === 0) {
    res.status(400).json({ error: 'Text produced no valid chunks' });
    return;
  }

  // Embed only the first 30 000 chars to stay within model token limits
  const embedded = await Promise.all(
    chunks.map(async (c) => ({
      chunk: c,
      embedding: await embed(c.content.slice(0, 30000)),
    })),
  );

  const inserted = await Promise.all(
    embedded.map(async ({ chunk, embedding }) => {
      const vecStr = `[${embedding.join(',')}]`;
      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO owner_kb (id, operator_id, owner_id, content, embedding, source_name, source_url, source_type, chunk_index, created_at)
         VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9, NOW())`,
        [id, operatorId, req.owner!.ownerId, chunk.content, vecStr, sourceName ?? null, sourceUrl ?? null, sourceType, chunk.chunkIndex],
      );

      return { id, chunkIndex: chunk.chunkIndex, length: chunk.content.length };
    }),
  );

  res.status(201).json({
    ok: true,
    operatorId,
    chunksIngested: inserted.length,
    chunks: inserted,
    sourceName: sourceName ?? null,
  });

  triggerSelfAwareness(operatorId, 'kb_learn').catch(() => {});
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const rows = await db
    .select({
      id: ownerKbTable.id,
      content: ownerKbTable.content,
      sourceName: ownerKbTable.sourceName,
      sourceUrl: ownerKbTable.sourceUrl,
      sourceType: ownerKbTable.sourceType,
      chunkIndex: ownerKbTable.chunkIndex,
      createdAt: ownerKbTable.createdAt,
    })
    .from(ownerKbTable)
    .where(
      and(eq(ownerKbTable.operatorId, operatorId), eq(ownerKbTable.ownerId, req.owner!.ownerId)),
    );

  res.json({ operatorId, count: rows.length, entries: rows });
});

router.get('/:chunkId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [row] = await db
    .select()
    .from(ownerKbTable)
    .where(
      and(
        eq(ownerKbTable.id, req.params.chunkId),
        eq(ownerKbTable.operatorId, operatorId),
      ),
    );

  if (!row) { res.status(404).json({ error: 'Chunk not found' }); return; }
  res.json({ ...row, embedding: undefined });
});

router.delete('/:chunkId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [row] = await db
    .select({ id: ownerKbTable.id })
    .from(ownerKbTable)
    .where(
      and(
        eq(ownerKbTable.id, req.params.chunkId),
        eq(ownerKbTable.operatorId, operatorId),
      ),
    );

  if (!row) { res.status(404).json({ error: 'Chunk not found' }); return; }

  await db.delete(ownerKbTable).where(eq(ownerKbTable.id, row.id));
  res.json({ ok: true, deleted: row.id });
});

export default router;
