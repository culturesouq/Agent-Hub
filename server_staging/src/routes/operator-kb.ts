import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db, pool } from '@workspace/db';
import { operatorKbTable, operatorsTable } from '@workspace/db';
import { embed } from '@workspace/opsoul-utils/ai';
import { requireAuth } from '../middleware/requireAuth.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { eq, and, gte, ne } from 'drizzle-orm';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// SRAG canonical entity types — shared with owner-kb route. Keep enums
// in sync (six shapes total).
const ENTITY_TYPES = ['fact', 'insight', 'entity', 'event', 'reference', 'procedure'] as const;

const IngestSchema = z.object({
  text: z.string().min(10),
  sourceName: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  sourceTrustLevel: z
    .enum(['operator_self', 'user_provided', 'external_verified', 'external_unverified'])
    .default('operator_self'),
  confidenceScore: z.number().int().min(75).max(100).default(75),
  // Pipeline callers (kbIntake, platformKbSeed, autoInstall) still send
  // intakeTags directly. UI sends `tags` (SRAG nomenclature). Both feed
  // the same column. At least one of the two must yield a non-empty list
  // — enforced in the handler below.
  intakeTags: z.array(z.string()).optional(),
  tags: z.array(z.string().min(1)).optional(),
  entityType: z.enum(ENTITY_TYPES).default('reference'),
  isPipelineIntake: z.boolean().default(false),
  privacyCleared: z.boolean().default(false),
  contentCleared: z.boolean().default(false),
});

const PatchChunkSchema = z.object({
  confidenceScore: z.number().int().min(75).max(100).optional(),
  verificationStatus: z
    .enum(['pending', 'verified', 'probation', 'blocked'])
    .optional(),
  flagReason: z.string().max(500).optional(),
  privacyCleared: z.boolean().optional(),
  contentCleared: z.boolean().optional(),
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

  const data = parsed.data;

  // SRAG tags discipline — at least one tag required for owner-driven
  // writes (UI sends `tags`). Pipeline writes (kbIntake/seed/autoInstall)
  // can pass through with no tags; they're flagged isPipelineIntake=true
  // and run a different curation path. Owner manual entries MUST tag.
  const incomingTags = Array.from(new Set([
    ...(data.tags ?? []),
    ...(data.intakeTags ?? []),
  ].map(t => t.trim()).filter(Boolean)));
  if (!data.isPipelineIntake && incomingTags.length === 0) {
    res.status(400).json({
      error: 'Validation failed',
      issues: { tags: ['at least one non-empty tag is required for owner-entered knowledge'] },
    });
    return;
  }

  // Always store as a single entry — no chunking
  const fullText = data.text.trim();
  if (!fullText) {
    res.status(400).json({ error: 'Text produced no valid content' });
    return;
  }

  // Embed up to 30 000 chars to stay within model token limits
  const embedding = await embed(fullText.slice(0, 30000));
  const vecStr = `[${embedding.join(',')}]`;
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO operator_kb
       (id, operator_id, owner_id, content, embedding, source_name, source_url,
        source_trust_level, confidence_score, intake_tags, is_pipeline_intake,
        privacy_cleared, content_cleared, verification_status, chunk_index,
        entity_type, created_at)
     VALUES ($1,$2,$3,$4,$5::vector,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,$15,NOW())`,
    [
      id, operatorId, req.owner!.ownerId, fullText, vecStr,
      data.sourceName ?? null, data.sourceUrl ?? null,
      data.sourceTrustLevel, data.confidenceScore, incomingTags,
      data.isPipelineIntake, data.privacyCleared, data.contentCleared,
      0,
      data.entityType,
    ],
  );

  res.status(201).json({
    ok: true,
    operatorId,
    chunksIngested: 1,
    chunks: [{ id, chunkIndex: 0, length: fullText.length, entityType: data.entityType, tags: incomingTags }],
    entityType: data.entityType,
    tags: incomingTags,
  });

  triggerSelfAwareness(operatorId, 'kb_learn').catch(() => {});
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const minConfidence = req.query.minConfidence
    ? parseInt(req.query.minConfidence as string, 10)
    : 0;
  const status = req.query.status as string | undefined;

  let query = db
    .select({
      id: operatorKbTable.id,
      content: operatorKbTable.content,
      confidenceScore: operatorKbTable.confidenceScore,
      verificationStatus: operatorKbTable.verificationStatus,
      sourceName: operatorKbTable.sourceName,
      sourceUrl: operatorKbTable.sourceUrl,
      sourceTrustLevel: operatorKbTable.sourceTrustLevel,
      intakeTags: operatorKbTable.intakeTags,
      // Mirror under the SRAG name too so the UI can read either field
      // without caring about back-compat label drift.
      tags: operatorKbTable.intakeTags,
      entityType: operatorKbTable.entityType,
      chunkIndex: operatorKbTable.chunkIndex,
      flagReason: operatorKbTable.flagReason,
      createdAt: operatorKbTable.createdAt,
    })
    .from(operatorKbTable)
    .where(
      and(
        eq(operatorKbTable.operatorId, operatorId),
        eq(operatorKbTable.ownerId, req.owner!.ownerId),
        ne(operatorKbTable.isSystem, true),
        minConfidence > 0 ? gte(operatorKbTable.confidenceScore, minConfidence) : undefined,
        status ? eq(operatorKbTable.verificationStatus, status) : undefined,
      ),
    );

  const rows = await query;
  res.json({ operatorId, count: rows.length, entries: rows });
});

router.get('/:chunkId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [row] = await db
    .select()
    .from(operatorKbTable)
    .where(
      and(
        eq(operatorKbTable.id, req.params.chunkId as string),
        eq(operatorKbTable.operatorId, operatorId),
      ),
    );

  if (!row) { res.status(404).json({ error: 'Chunk not found' }); return; }
  res.json({ ...row, embedding: undefined });
});

router.patch('/:chunkId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [row] = await db
    .select({ id: operatorKbTable.id })
    .from(operatorKbTable)
    .where(
      and(
        eq(operatorKbTable.id, req.params.chunkId as string),
        eq(operatorKbTable.operatorId, operatorId),
      ),
    );
  if (!row) { res.status(404).json({ error: 'Chunk not found' }); return; }

  const parsed = PatchChunkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields provided to update' });
    return;
  }

  const extra: Record<string, unknown> = {};
  if (updates.verificationStatus === 'verified') {
    extra.lastVerifiedAt = new Date();
  }

  const [updated] = await db
    .update(operatorKbTable)
    .set({ ...updates, ...extra })
    .where(eq(operatorKbTable.id, row.id))
    .returning({
      id: operatorKbTable.id,
      confidenceScore: operatorKbTable.confidenceScore,
      verificationStatus: operatorKbTable.verificationStatus,
      flagReason: operatorKbTable.flagReason,
      lastVerifiedAt: operatorKbTable.lastVerifiedAt,
    });

  res.json({ ok: true, chunk: updated });

  if (updates.verificationStatus === 'verified') {
    triggerSelfAwareness(operatorId, 'kb_learn').catch(() => {});
  }
});

router.delete('/:chunkId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [row] = await db
    .select({ id: operatorKbTable.id, isSystem: operatorKbTable.isSystem })
    .from(operatorKbTable)
    .where(
      and(
        eq(operatorKbTable.id, req.params.chunkId as string),
        eq(operatorKbTable.operatorId, operatorId),
      ),
    );
  if (!row) { res.status(404).json({ error: 'Chunk not found' }); return; }

  if (row.isSystem) {
    res.status(403).json({ error: 'Platform KB entries are read-only and cannot be deleted.' });
    return;
  }

  await db.delete(operatorKbTable).where(eq(operatorKbTable.id, row.id));
  res.json({ ok: true, deleted: row.id });
});

export default router;
