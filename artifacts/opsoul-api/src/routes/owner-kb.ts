import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db, pool } from '@workspace/db';
import { ownerKbTable, operatorsTable } from '@workspace/db';
import { embed } from '@workspace/opsoul-utils/ai';
import { requireAuth } from '../middleware/requireAuth.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { eq, and } from 'drizzle-orm';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const IngestSchema = z.object({
  text: z.string().min(10, 'text must be at least 10 characters'),
  sourceName: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  // sourceType is a label, not a behavior switch any more (all entries stay
  // whole now). 'document' was being sent by the Hub UI after a file upload
  // but was previously rejected as out-of-enum — added to keep file uploads
  // from 400ing.
  sourceType: z.enum(['manual', 'url', 'file', 'pipeline', 'document']).default('manual'),
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

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = IngestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { text, sourceName, sourceUrl, sourceType } = parsed.data;

  // Always store as a single entry — no chunking. Reference documents must
  // stay whole so the operator pulls the full context when any part is
  // relevant, instead of guessing from a 500-char fragment. Matches the
  // operator-kb route. Owner direction 2026-05-24: "documents stay together
  // for the operator's mental health" — regardless of size.
  const fullText = text.trim();
  if (!fullText) {
    res.status(400).json({ error: 'Text produced no valid content' });
    return;
  }

  // Embed only the first 30 000 chars to stay within model token limits.
  // The stored content is still the full text; the embedding samples the head.
  const embedding = await embed(fullText.slice(0, 30000));
  const vecStr = `[${embedding.join(',')}]`;
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO owner_kb (id, operator_id, owner_id, content, embedding, source_name, source_url, source_type, chunk_index, created_at)
     VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9, NOW())`,
    [id, operatorId, req.owner!.ownerId, fullText, vecStr, sourceName ?? null, sourceUrl ?? null, sourceType, 0],
  );

  res.status(201).json({
    ok: true,
    operatorId,
    chunksIngested: 1,
    chunks: [{ id, chunkIndex: 0, length: fullText.length }],
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
        eq(ownerKbTable.id, req.params.chunkId as string),
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
        eq(ownerKbTable.id, req.params.chunkId as string),
        eq(ownerKbTable.operatorId, operatorId),
      ),
    );

  if (!row) { res.status(404).json({ error: 'Chunk not found' }); return; }

  await db.delete(ownerKbTable).where(eq(ownerKbTable.id, row.id));
  res.json({ ok: true, deleted: row.id });
});

export default router;
