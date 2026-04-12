import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db-v2';
import { ragDnaTable } from '@workspace/db-v2';
import { eq, and, sql, desc } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { validateEntry, runDiscoverySweep } from '../utils/vaelEngine.js';

const VALID_LAYERS = ['builder', 'archetype', 'collective'] as const;
const VALID_ARCHETYPES = [
  'Advisor', 'Executor', 'Expert', 'Connector', 'Creator',
  'Guardian', 'Builder', 'Catalyst', 'Analyst',
];
const VALID_ARCHETYPES_LIST = VALID_ARCHETYPES;

const SCREENER_SYSTEM = `You are a collective DNA screener for an AI operator platform. Your job is to:
1. Decide if a KB entry belongs in the shared DNA corpus
2. If eligible, classify its scope and tagging

ELIGIBLE KNOWLEDGE:
- Factual domain knowledge (research findings, how-to guides, technical facts)
- Verified information with broad applicability
- Insights, patterns, or methods that are genuinely reusable

NOT ELIGIBLE:
- User preference notes ("User likes X", "User prefers Y")
- Conversational observations about a specific user
- Personal context that only applies to one session

For eligible entries, classify scope:
- "general": Knowledge about how to think, communicate, or operate. Set archetype_scope to applicable archetypes from: [Advisor, Analyst, Executor, Catalyst, Expert, Mentor, Connector, Creator, Guardian]. Leave empty [] if truly universal.
- "specialty": Domain-specific knowledge. Set domain_tags accordingly.

Return only valid JSON:
{
  "eligible": true | false,
  "reason": "<only if not eligible>",
  "dna_scope": "general" | "specialty",
  "archetype_scope": ["Analyst"],
  "domain_tags": ["finance"]
}`;

async function screenForCollective(content: string): Promise<{
  eligible: boolean;
  reason?: string;
  dnaScope?: 'general' | 'specialty';
  archetypeScope?: string[];
  domainTags?: string[];
}> {
  try {
    const result = await chatCompletion(
      [
        { role: 'system', content: SCREENER_SYSTEM },
        { role: 'user', content: `Screen this KB entry:\n\n"""\n${content.slice(0, 800)}\n"""` },
      ],
      { model: CHAT_MODEL },
    );
    const parsed = JSON.parse(result.content.trim()) as {
      eligible?: boolean;
      reason?: string;
      dna_scope?: string;
      archetype_scope?: string[];
      domain_tags?: string[];
    };
    return {
      eligible: !!parsed.eligible,
      reason: parsed.reason,
      dnaScope: parsed.dna_scope === 'specialty' ? 'specialty' : 'general',
      archetypeScope: Array.isArray(parsed.archetype_scope)
        ? parsed.archetype_scope.filter((a: string) => VALID_ARCHETYPES_LIST.includes(a))
        : [],
      domainTags: Array.isArray(parsed.domain_tags) ? parsed.domain_tags : [],
    };
  } catch {
    return { eligible: true, dnaScope: 'general', archetypeScope: [], domainTags: [] };
  }
}

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

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

  res.json({
    builderCount: builderCount.count,
    archetypeCount: archetypeCount.count,
    collectiveCount: collectiveCount.count,
    totalActive: totalActive.count,
  });
});

router.get('/entries', async (req: Request, res: Response): Promise<void> => {
  const { layer, archetype, active, status } = req.query as Record<string, string>;

  const conditions: ReturnType<typeof eq>[] = [];
  if (layer && VALID_LAYERS.includes(layer as typeof VALID_LAYERS[number])) {
    conditions.push(eq(ragDnaTable.layer, layer));
  }
  if (archetype) conditions.push(eq(ragDnaTable.archetype, archetype));
  if (active === 'true') conditions.push(eq(ragDnaTable.isActive, true));
  if (active === 'false') conditions.push(eq(ragDnaTable.isActive, false));
  if (status && ['current', 'upgraded', 'deprecated', 'draft'].includes(status)) {
    conditions.push(eq(ragDnaTable.knowledgeStatus, status as 'current' | 'upgraded' | 'deprecated' | 'draft'));
  }

  const entries = await db
    .select({
      id: ragDnaTable.id,
      layer: ragDnaTable.layer,
      archetype: ragDnaTable.archetype,
      title: ragDnaTable.title,
      content: ragDnaTable.content,
      tags: ragDnaTable.tags,
      sourceName: ragDnaTable.sourceName,
      confidence: ragDnaTable.confidence,
      knowledgeStatus: ragDnaTable.knowledgeStatus,
      isActive: ragDnaTable.isActive,
      hasEmbedding: sql<boolean>`(embedding IS NOT NULL)`,
      dnaScope: ragDnaTable.dnaScope,
      archetypeScope: ragDnaTable.archetypeScope,
      domainTags: ragDnaTable.domainTags,
      createdAt: ragDnaTable.createdAt,
      updatedAt: ragDnaTable.updatedAt,
    })
    .from(ragDnaTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ragDnaTable.createdAt));

  res.json(entries);
});

router.post('/entries', async (req: Request, res: Response): Promise<void> => {
  const { layer, archetype, title, content, tags, sourceName, confidence, knowledgeStatus } = req.body as {
    layer: string;
    archetype?: string;
    title: string;
    content: string;
    tags?: string[];
    sourceName?: string;
    confidence?: number;
    knowledgeStatus?: 'current' | 'upgraded' | 'deprecated' | 'draft';
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
  try { embedding = await embed(content); } catch { /* non-fatal */ }

  const [entry] = await db.insert(ragDnaTable).values({
    layer,
    archetype: archetype ?? null,
    title,
    content,
    embedding: embedding ?? null,
    tags: tags ?? [],
    sourceName: sourceName ?? null,
    confidence: confidence ?? 0.8,
    knowledgeStatus: knowledgeStatus ?? 'draft',
    isActive: true,
  }).returning();

  res.status(201).json(entry);
});

router.put('/entries/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const {
    title, content, tags, isActive, archetype, sourceName, confidence,
    knowledgeStatus, dnaScope, archetypeScope, domainTags,
  } = req.body as {
    title?: string;
    content?: string;
    tags?: string[];
    isActive?: boolean;
    archetype?: string;
    sourceName?: string;
    confidence?: number;
    knowledgeStatus?: 'current' | 'upgraded' | 'deprecated' | 'draft';
    dnaScope?: 'general' | 'specialty';
    archetypeScope?: string[];
    domainTags?: string[];
  };

  const [existing] = await db.select().from(ragDnaTable).where(eq(ragDnaTable.id, id));
  if (!existing) { res.status(404).json({ error: 'Entry not found' }); return; }

  const updates: Partial<typeof ragDnaTable.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (tags !== undefined) updates.tags = tags;
  if (isActive !== undefined) updates.isActive = isActive;
  if (archetype !== undefined) updates.archetype = archetype;
  if (sourceName !== undefined) updates.sourceName = sourceName;
  if (confidence !== undefined) updates.confidence = confidence;
  if (knowledgeStatus !== undefined) updates.knowledgeStatus = knowledgeStatus;
  if (dnaScope !== undefined) updates.dnaScope = dnaScope;
  if (archetypeScope !== undefined) updates.archetypeScope = archetypeScope;
  if (domainTags !== undefined) updates.domainTags = domainTags;

  if (content !== undefined && content !== existing.content) {
    updates.content = content;
    try { updates.embedding = await embed(content); } catch { /* keep old */ }
  }

  const [updated] = await db.update(ragDnaTable).set(updates).where(eq(ragDnaTable.id, id)).returning();
  res.json(updated);
});

router.patch('/entries/:id/scope', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { dnaScope, archetypeScope, domainTags } = req.body as {
    dnaScope?: 'general' | 'specialty';
    archetypeScope?: string[];
    domainTags?: string[];
  };

  const [existing] = await db.select().from(ragDnaTable).where(eq(ragDnaTable.id, id));
  if (!existing) { res.status(404).json({ error: 'Entry not found' }); return; }

  const updates: Partial<typeof ragDnaTable.$inferInsert> = { updatedAt: new Date() };
  if (dnaScope !== undefined) updates.dnaScope = dnaScope;
  if (archetypeScope !== undefined) updates.archetypeScope = archetypeScope;
  if (domainTags !== undefined) updates.domainTags = domainTags;

  const [updated] = await db.update(ragDnaTable).set(updates).where(eq(ragDnaTable.id, id)).returning();
  res.json(updated);
});

router.delete('/entries/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const [existing] = await db.select().from(ragDnaTable).where(eq(ragDnaTable.id, id));
  if (!existing) { res.status(404).json({ error: 'Entry not found' }); return; }

  await db.update(ragDnaTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(ragDnaTable.id, id));

  res.json({ ok: true });
});

router.post('/vael/validate', async (req: Request, res: Response): Promise<void> => {
  const { title, content, layer, archetype, tags, sourceName, confidence } = req.body as {
    title: string;
    content: string;
    layer: string;
    archetype?: string;
    tags?: string[];
    sourceName?: string;
    confidence?: number;
  };

  if (!title || !content || !layer) {
    res.status(400).json({ error: 'title, content, layer are required' });
    return;
  }

  try {
    const result = await validateEntry({ title, content, layer, archetype, tags: tags ?? [], sourceName, confidence });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Validation failed', detail: (err as Error).message });
  }
});

router.post('/vael/discover', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await runDiscoverySweep();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Discovery sweep failed', detail: (err as Error).message });
  }
});

router.post('/screen', async (req: Request, res: Response): Promise<void> => {
  const { content } = req.body as { content?: string };
  if (!content?.trim()) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  try {
    const result = await screenForCollective(content);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Screening failed', detail: (err as Error).message });
  }
});

// ── Pipeline config (stub — rag_pipeline_config table not in v2 schema yet) ──

const DEFAULT_PIPELINE = {
  id: 'v3-default',
  enabled: true,
  minConfidenceScore: 70,
  deduplicationThreshold: 92,
  updatedAt: new Date().toISOString(),
};

router.get('/pipeline', (_req: Request, res: Response): void => {
  res.json(DEFAULT_PIPELINE);
});

router.put('/pipeline', (req: Request, res: Response): void => {
  const { enabled, minConfidenceScore, deduplicationThreshold } = req.body as {
    enabled?: boolean;
    minConfidenceScore?: number;
    deduplicationThreshold?: number;
  };
  res.json({
    ...DEFAULT_PIPELINE,
    ...(enabled !== undefined ? { enabled } : {}),
    ...(minConfidenceScore !== undefined ? { minConfidenceScore: Math.max(0, Math.min(100, minConfidenceScore)) } : {}),
    ...(deduplicationThreshold !== undefined ? { deduplicationThreshold: Math.max(50, Math.min(100, deduplicationThreshold)) } : {}),
    updatedAt: new Date().toISOString(),
  });
});

router.post('/pipeline/run', async (_req: Request, res: Response): Promise<void> => {
  res.json({ extracted: 0, candidatesScanned: 0, message: 'Pipeline run is pending full v3 migration of rag_pipeline_config table' });
});

export default router;
