import { Router, type Request, type Response } from 'express';
import { db, pool, ragDnaTable, ragPipelineConfigTable, operatorKbTable } from '@workspace/db';
import { eq, and, sql, desc, isNull, or } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { embed } from '@workspace/opsoul-utils/ai';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

const VALID_LAYERS = ['builder', 'archetype', 'collective'] as const;
const VALID_ARCHETYPES = [
  'Advisor', 'Executor', 'Expert', 'Connector', 'Creator',
  'Guardian', 'Builder', 'Catalyst', 'Analyst',
];

// ── Stats ──────────────────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  const [[builderCount], [archetypeCount], [collectiveCount], [totalActive]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(ragDnaTable)
      .where(and(eq(ragDnaTable.layer, 'builder'), eq(ragDnaTable.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(ragDnaTable)
      .where(and(eq(ragDnaTable.layer, 'archetype'), eq(ragDnaTable.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(ragDnaTable)
      .where(and(eq(ragDnaTable.layer, 'collective'), eq(ragDnaTable.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(ragDnaTable)
      .where(eq(ragDnaTable.isActive, true)),
  ]);

  const [config] = await db.select().from(ragPipelineConfigTable).limit(1);

  res.json({
    builderCount: builderCount.count,
    archetypeCount: archetypeCount.count,
    collectiveCount: collectiveCount.count,
    totalActive: totalActive.count,
    pipelineEnabled: config?.enabled ?? false,
    lastRunAt: config?.lastRunAt ?? null,
    lastRunCount: config?.lastRunCount ?? 0,
    totalExtracted: config?.totalExtracted ?? 0,
  });
});

// ── DNA Entries ────────────────────────────────────────────────────────────

router.get('/entries', async (req: Request, res: Response): Promise<void> => {
  const { layer, archetype, active } = req.query as Record<string, string>;

  const conditions = [];
  if (layer && VALID_LAYERS.includes(layer as typeof VALID_LAYERS[number])) {
    conditions.push(eq(ragDnaTable.layer, layer));
  }
  if (archetype) {
    conditions.push(eq(ragDnaTable.archetype, archetype));
  }
  if (active === 'true') conditions.push(eq(ragDnaTable.isActive, true));
  if (active === 'false') conditions.push(eq(ragDnaTable.isActive, false));

  const entries = await db
    .select({
      id: ragDnaTable.id,
      layer: ragDnaTable.layer,
      archetype: ragDnaTable.archetype,
      title: ragDnaTable.title,
      content: ragDnaTable.content,
      tags: ragDnaTable.tags,
      isActive: ragDnaTable.isActive,
      hasEmbedding: sql<boolean>`(embedding IS NOT NULL)`,
      createdAt: ragDnaTable.createdAt,
      updatedAt: ragDnaTable.updatedAt,
    })
    .from(ragDnaTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ragDnaTable.createdAt));

  res.json(entries);
});

router.post('/entries', async (req: Request, res: Response): Promise<void> => {
  const { layer, archetype, title, content, tags, sourceName, confidence } = req.body as {
    layer: string;
    archetype?: string;
    title: string;
    content: string;
    tags?: string[];
    sourceName?: string;
    confidence?: number;
  };

  if (!layer || !title || !content) {
    res.status(400).json({ error: 'layer, title, and content are required' });
    return;
  }
  if (!VALID_LAYERS.includes(layer as typeof VALID_LAYERS[number])) {
    res.status(400).json({ error: `layer must be one of: ${VALID_LAYERS.join(', ')}` });
    return;
  }
  if (layer === 'archetype' && !archetype) {
    res.status(400).json({ error: 'archetype is required for layer=archetype' });
    return;
  }
  if (archetype && !VALID_ARCHETYPES.includes(archetype)) {
    res.status(400).json({ error: `Unknown archetype: ${archetype}` });
    return;
  }

  let embedding: number[] | undefined;
  try {
    embedding = await embed(content);
  } catch {
    // non-fatal — entry created without embedding, won't be retrievable in RAG
  }

  const [entry] = await db.insert(ragDnaTable).values({
    layer,
    archetype: archetype ?? null,
    title,
    content,
    embedding: embedding ?? null,
    tags: tags ?? [],
    sourceName: sourceName ?? null,
    confidence: confidence ?? 0.8,
    isActive: true,
  }).returning();

  res.status(201).json(entry);
});

router.put('/entries/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { title, content, tags, isActive, archetype, sourceName, confidence } = req.body as {
    title?: string;
    content?: string;
    tags?: string[];
    isActive?: boolean;
    archetype?: string;
    sourceName?: string;
    confidence?: number;
  };

  const [existing] = await db.select().from(ragDnaTable).where(eq(ragDnaTable.id, id));
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  const updates: Partial<typeof ragDnaTable.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (tags !== undefined) updates.tags = tags;
  if (isActive !== undefined) updates.isActive = isActive;
  if (archetype !== undefined) updates.archetype = archetype;
  if (sourceName !== undefined) updates.sourceName = sourceName;
  if (confidence !== undefined) updates.confidence = confidence;

  if (content !== undefined && content !== existing.content) {
    updates.content = content;
    try {
      updates.embedding = await embed(content);
    } catch {
      // keep old embedding
    }
  }

  const [updated] = await db.update(ragDnaTable).set(updates).where(eq(ragDnaTable.id, id)).returning();
  res.json(updated);
});

router.delete('/entries/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const [existing] = await db.select().from(ragDnaTable).where(eq(ragDnaTable.id, id));
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }
  await db.update(ragDnaTable).set({ isActive: false, updatedAt: new Date() }).where(eq(ragDnaTable.id, id));
  res.json({ ok: true });
});

// ── Pipeline Config ────────────────────────────────────────────────────────

async function ensurePipelineConfig() {
  const [existing] = await db.select().from(ragPipelineConfigTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(ragPipelineConfigTable).values({}).returning();
  return created;
}

router.get('/pipeline', async (_req: Request, res: Response): Promise<void> => {
  const config = await ensurePipelineConfig();
  res.json(config);
});

router.put('/pipeline', async (req: Request, res: Response): Promise<void> => {
  const { enabled, minConfidenceScore, deduplicationThreshold } = req.body as {
    enabled?: boolean;
    minConfidenceScore?: number;
    deduplicationThreshold?: number;
  };

  const config = await ensurePipelineConfig();

  const updates: Partial<typeof ragPipelineConfigTable.$inferInsert> = { updatedAt: new Date() };
  if (enabled !== undefined) updates.enabled = enabled;
  if (minConfidenceScore !== undefined) updates.minConfidenceScore = Math.max(0, Math.min(100, minConfidenceScore));
  if (deduplicationThreshold !== undefined) updates.deduplicationThreshold = Math.max(50, Math.min(100, deduplicationThreshold));

  const [updated] = await db.update(ragPipelineConfigTable)
    .set(updates)
    .where(eq(ragPipelineConfigTable.id, config.id))
    .returning();
  res.json(updated);
});

// ── Pipeline Run ───────────────────────────────────────────────────────────

router.post('/pipeline/run', async (_req: Request, res: Response): Promise<void> => {
  const config = await ensurePipelineConfig();

  const candidates = await db
    .select({
      id: operatorKbTable.id,
      content: operatorKbTable.content,
      confidenceScore: operatorKbTable.confidenceScore,
      intakeTags: operatorKbTable.intakeTags,
      sourceHash: sql<string>`md5(${operatorKbTable.content})`,
    })
    .from(operatorKbTable)
    .where(and(
      sql`confidence_score >= ${config.minConfidenceScore ?? 70}`,
      eq(operatorKbTable.verificationStatus, 'verified'),
      eq(operatorKbTable.privacyCleared, true),
    ))
    .limit(200);

  let extracted = 0;
  const threshold = (config.deduplicationThreshold ?? 92) / 100;

  for (const candidate of candidates) {
    const hash = candidate.sourceHash;

    // skip if we already have an entry with the same hash
    const [existing] = await db.select({ id: ragDnaTable.id })
      .from(ragDnaTable)
      .where(and(
        eq(ragDnaTable.layer, 'collective'),
        eq(ragDnaTable.sourceHash, hash),
      ))
      .limit(1);

    if (existing) continue;

    // check semantic dedup against existing collective entries
    let embedding: number[] | undefined;
    try {
      embedding = await embed(candidate.content);
    } catch {
      continue;
    }

    const vecStr = `[${embedding.join(',')}]`;
    const nearDup = await pool.query<{ distance: number }>(
      `SELECT (embedding <=> $1::vector) AS distance
       FROM rag_dna
       WHERE layer = 'collective' AND embedding IS NOT NULL
       ORDER BY distance ASC LIMIT 1`,
      [vecStr],
    );

    if (nearDup.rows.length > 0 && (1 - nearDup.rows[0].distance) >= threshold) continue;

    await db.insert(ragDnaTable).values({
      layer: 'collective',
      title: `Collective: ${(candidate.intakeTags ?? []).slice(0, 3).join(', ') || 'General'}`,
      content: candidate.content,
      embedding,
      tags: candidate.intakeTags ?? [],
      sourceHash: hash,
      isActive: true,
    });

    extracted++;
  }

  await db.update(ragPipelineConfigTable)
    .set({
      lastRunAt: new Date(),
      lastRunCount: extracted,
      totalExtracted: sql`total_extracted + ${extracted}`,
      updatedAt: new Date(),
    })
    .where(eq(ragPipelineConfigTable.id, config.id));

  res.json({ extracted, candidatesScanned: candidates.length });
});

export default router;
