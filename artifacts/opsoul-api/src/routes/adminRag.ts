import { Router, type Request, type Response } from 'express';
import { db, pool, ragDnaTable, ragPipelineConfigTable, operatorKbTable, ragSourcesTable, operatorsTable } from '@workspace/db';
import type { RagSourceType } from '@workspace/db';
import { eq, and, sql, desc, isNull, or, notInArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion, KB_MODEL } from '../utils/openrouter.js';

import { validateEntry, runDiscoverySweep } from '../utils/vaelEngine.js';
import multer from 'multer';

const INBOX_DIR     = path.resolve(process.cwd(), 'knowledge_inbox');
const PROCESSED_DIR = path.join(INBOX_DIR, 'processed');

const TEXT_EXTS = new Set(['.txt','.md','.markdown','.csv','.json','.log','.yaml','.yml','.toml','.ini','.html','.htm','.xml','.rst']);

function extOf(name: string) { return ('.' + name.split('.').pop()!.toLowerCase()); }

async function extractTextFromBuffer(buffer: Buffer, mimetype: string, filename: string): Promise<string | null> {
  const ext = extOf(filename);
  if (TEXT_EXTS.has(ext) || mimetype.startsWith('text/')) return buffer.toString('utf-8');
  if (mimetype === 'application/pdf' || ext === '.pdf') {
    const pdfParse = (await import('pdf-parse') as unknown as { default: (buf: Buffer) => Promise<{ text: string }> }).default;
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (mimetype === 'application/msword' || ext === '.doc') return null;
  return buffer.toString('utf-8');
}

const inboxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── Pipeline content screener ────────────────────────────────────────────────

const VALID_ARCHETYPES_LIST = ['Advisor', 'Analyst', 'Executor', 'Catalyst', 'Expert', 'Mentor', 'Connector', 'Creator', 'Guardian'];

// ── Operators permanently excluded from collective pipeline extraction ─────────
// These operators absorb knowledge from all layers but never contribute to
// the collective corpus — their learning stays private to them.
const PIPELINE_EXCLUDED_OPERATORS = [
  'a826164f-3111-4cc9-8f3c-856ecc589d77', // Vael — internal validator/discoverer
];

const SCREENER_SYSTEM = `You are Vael, the intelligence guardian for OpSoul. Your job is to validate entries for the OpSoul DNA corpus — the platform's identity layer.

DNA entries must be exclusively about OpSoul: how the platform works, what operators are, the 6-layer stack (Human Core → Identity → Self-Awareness → GROW → Agency → Senses), the 9 archetypes, Vael's role, GROW system, collective intelligence, operator lifecycle, and platform principles.

DNA is NOT for general agentic knowledge, external domain facts, or how-to guides about third-party APIs. That belongs in platform KB or operator KB.

ELIGIBLE DNA:
- How OpSoul operators think, evolve, and behave on the platform
- Archetype-specific behavioral principles (how an Executor vs Advisor approaches tasks on OpSoul)
- Platform mechanics: GROW, self-awareness engine, curiosity engine, operator maturity lifecycle
- OpSoul values: identity-first, adapt-never-adopt, operator sovereignty
- Collective intelligence patterns observed across operators on the platform
- Vael's role and validation mandate

NOT ELIGIBLE:
- General API usage guides
- External domain knowledge (finance, legal, medical, etc.)
- Generic agentic AI patterns not specific to OpSoul
- User preference notes or session observations

For eligible entries, classify scope:
- "general": Applies across all operators or multiple archetypes. Set archetype_scope to relevant archetypes from: [Advisor, Analyst, Executor, Catalyst, Expert, Mentor, Connector, Creator, Guardian]. Empty [] = applies to all.
- "specialty": Specific to one archetype or one platform subsystem.

Return only valid JSON. No preamble.

Schema:
{
  "eligible": true | false,
  "reason": "<only if not eligible>",
  "dna_scope": "general" | "specialty",
  "archetype_scope": ["Analyst", "Expert"],
  "domain_tags": ["grow", "self-awareness", "archetype"]
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
      { model: KB_MODEL },
    );
    const parsed = JSON.parse(result.content.trim());
    return {
      eligible: !!parsed.eligible,
      reason: parsed.reason,
      dnaScope: parsed.dna_scope ?? 'general',
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
  const { layer, archetype, active, status } = req.query as Record<string, string>;

  const conditions = [];
  if (layer && VALID_LAYERS.includes(layer as typeof VALID_LAYERS[number])) {
    conditions.push(eq(ragDnaTable.layer, layer));
  }
  if (archetype) {
    conditions.push(eq(ragDnaTable.archetype, archetype));
  }
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
    knowledgeStatus: knowledgeStatus ?? 'draft',
    isActive: true,
  }).returning();

  res.status(201).json(entry);
});

router.put('/entries/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { title, content, tags, isActive, archetype, sourceName, confidence, knowledgeStatus, dnaScope, archetypeScope, domainTags } = req.body as {
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
  if (knowledgeStatus !== undefined) updates.knowledgeStatus = knowledgeStatus;
  if (dnaScope !== undefined) updates.dnaScope = dnaScope;
  if (archetypeScope !== undefined) updates.archetypeScope = archetypeScope;
  if (domainTags !== undefined) updates.domainTags = domainTags;

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

router.patch('/entries/:id/scope', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { dnaScope, archetypeScope, domainTags } = req.body as {
    dnaScope?: 'general' | 'specialty';
    archetypeScope?: string[];
    domainTags?: string[];
  };

  const [existing] = await db.select({ id: ragDnaTable.id }).from(ragDnaTable).where(eq(ragDnaTable.id, id));
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  const updates: Partial<typeof ragDnaTable.$inferInsert> = { updatedAt: new Date() };
  if (dnaScope !== undefined) updates.dnaScope = dnaScope;
  if (archetypeScope !== undefined) updates.archetypeScope = archetypeScope;
  if (domainTags !== undefined) updates.domainTags = domainTags;

  const [updated] = await db.update(ragDnaTable).set(updates).where(eq(ragDnaTable.id, id)).returning({
    id: ragDnaTable.id,
    dnaScope: ragDnaTable.dnaScope,
    archetypeScope: ragDnaTable.archetypeScope,
    domainTags: ragDnaTable.domainTags,
  });
  res.json(updated);
});

router.delete('/entries/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
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
      notInArray(operatorKbTable.operatorId, PIPELINE_EXCLUDED_OPERATORS),
    ))
    .limit(200);

  let extracted = 0;
  let filteredByScreener = 0;
  let filteredByDedup = 0;
  const threshold = (config.deduplicationThreshold ?? 92) / 100;
  const screenerRejections: { content: string; reason: string }[] = [];

  for (const candidate of candidates) {
    const hash = candidate.sourceHash;

    // ── LLM content screener — block diary/context entries ──────────────────
    const screen = await screenForCollective(candidate.content);
    if (!screen.eligible) {
      filteredByScreener++;
      screenerRejections.push({
        content: candidate.content.slice(0, 120),
        reason: screen.reason ?? 'diary or user-context entry',
      });
      continue;
    }

    // skip if we already have an entry with the same hash
    const [existing] = await db.select({ id: ragDnaTable.id })
      .from(ragDnaTable)
      .where(and(
        eq(ragDnaTable.layer, 'collective'),
        eq(ragDnaTable.sourceHash, hash),
      ))
      .limit(1);

    if (existing) { filteredByDedup++; continue; }

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

    if (nearDup.rows.length > 0 && (1 - nearDup.rows[0].distance) >= threshold) {
      filteredByDedup++;
      continue;
    }

    await db.insert(ragDnaTable).values({
      layer: 'collective',
      title: `Collective: ${(candidate.intakeTags ?? []).slice(0, 3).join(', ') || 'General'}`,
      content: candidate.content,
      embedding,
      tags: candidate.intakeTags ?? [],
      sourceHash: hash,
      dnaScope: screen.dnaScope ?? 'general',
      archetypeScope: screen.archetypeScope ?? [],
      domainTags: screen.domainTags ?? [],
      isActive: true,
      knowledgeStatus: 'draft',
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

  res.json({
    extracted,
    candidatesScanned: candidates.length,
    filteredByScreener,
    filteredByDedup,
    screenerRejections: screenerRejections.slice(0, 10),
  });
});

// ── Screener — test a content string against the collective screener ───────

router.post('/screen', async (req: Request, res: Response): Promise<void> => {
  const { content } = req.body as { content?: string };
  if (!content?.trim()) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  try {
    const result = await screenForCollective(content);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Screening failed', detail: (e as Error).message });
  }
});

// ── Vael — Validate entry ─────────────────────────────────────────────────

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
    res.status(400).json({ error: 'title, content, and layer are required' });
    return;
  }

  try {
    const result = await validateEntry({ title, content, layer, archetype, tags: tags ?? [], sourceName, confidence });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Vael validation failed', detail: (e as Error).message });
  }
});

// ── Vael — Discovery sweep ────────────────────────────────────────────────

router.post('/vael/discover', async (req: Request, res: Response): Promise<void> => {
  const { focus } = req.body as { focus?: string };

  try {
    const result = await runDiscoverySweep(focus);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Vael discovery sweep failed', detail: (e as Error).message });
  }
});

// ── Source Registry — CRUD ─────────────────────────────────────────────────

router.get('/sources', async (_req: Request, res: Response): Promise<void> => {
  const sources = await db
    .select()
    .from(ragSourcesTable)
    .orderBy(ragSourcesTable.createdAt);
  res.json(sources);
});

router.post('/sources', async (req: Request, res: Response): Promise<void> => {
  const { name, sourceType, url, notes } = req.body as {
    name?: string; sourceType?: string; url?: string; notes?: string;
  };

  const validTypes: RagSourceType[] = ['huggingface', 'github_file', 'github_repo', 'raw_url'];
  if (!name?.trim() || !url?.trim() || !sourceType || !validTypes.includes(sourceType as RagSourceType)) {
    res.status(400).json({ error: 'name, url, and a valid sourceType are required' });
    return;
  }

  const [created] = await db.insert(ragSourcesTable).values({
    id: randomUUID(),
    name: name.trim(),
    sourceType: sourceType as RagSourceType,
    url: url.trim(),
    notes: notes?.trim() ?? null,
  }).returning();

  res.status(201).json(created);
});

router.patch('/sources/:sourceId', async (req: Request, res: Response): Promise<void> => {
  const { sourceId } = req.params as Record<string, string>;
  const { name, url, notes, isActive } = req.body as {
    name?: string; url?: string; notes?: string; isActive?: boolean;
  };

  const updates: Partial<typeof ragSourcesTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name.trim();
  if (url !== undefined) updates.url = url.trim();
  if (notes !== undefined) updates.notes = notes.trim() || null;
  if (isActive !== undefined) updates.isActive = isActive;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }

  const [updated] = await db
    .update(ragSourcesTable)
    .set(updates)
    .where(eq(ragSourcesTable.id, sourceId))
    .returning();

  if (!updated) { res.status(404).json({ error: 'Source not found' }); return; }
  res.json(updated);
});

router.delete('/sources/:sourceId', async (req: Request, res: Response): Promise<void> => {
  const { sourceId } = req.params as Record<string, string>;
  await db.delete(ragSourcesTable).where(eq(ragSourcesTable.id, sourceId));
  res.json({ ok: true, deleted: sourceId });
});

// ── Knowledge Inbox — browse & submit ─────────────────────────────────────────

router.get('/inbox', async (_req: Request, res: Response): Promise<void> => {
  try {
    await fs.mkdir(PROCESSED_DIR, { recursive: true });

    const pending = (await fs.readdir(INBOX_DIR))
      .filter(f => /\.(md|txt)$/i.test(f));

    const processedAll = (await fs.readdir(PROCESSED_DIR))
      .filter(f => /\.(md|txt)$/i.test(f))
      .sort()
      .reverse()
      .slice(0, 20);

    res.json({ pending, processed: processedAll });
  } catch (e) {
    res.status(500).json({ error: 'Could not read inbox', detail: (e as Error).message });
  }
});

router.post('/inbox', async (req: Request, res: Response): Promise<void> => {
  const { title, content } = req.body as { title?: string; content?: string };
  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({ error: 'title and content are required' });
    return;
  }
  try {
    await fs.mkdir(INBOX_DIR, { recursive: true });
    const safe = title.trim().replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 60);
    const filename = `${safe}.md`;
    const filePath = path.join(INBOX_DIR, filename);
    await fs.writeFile(filePath, `# ${title.trim()}\n\n${content.trim()}`, 'utf-8');
    res.status(201).json({ ok: true, filename });
  } catch (e) {
    res.status(500).json({ error: 'Could not write to inbox', detail: (e as Error).message });
  }
});

router.delete('/inbox/:filename', async (req: Request, res: Response): Promise<void> => {
  const filename = path.basename(String(req.params.filename as string));
  if (!/\.(md|txt)$/i.test(filename)) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  try {
    await fs.unlink(path.join(INBOX_DIR, filename));
    res.json({ ok: true, deleted: filename });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

router.post('/inbox/upload', inboxUpload.array('files', 50), async (req: Request, res: Response): Promise<void> => {
  const files = (req.files ?? []) as Express.Multer.File[];
  if (files.length === 0) { res.status(400).json({ error: 'No files received' }); return; }

  await fs.mkdir(INBOX_DIR, { recursive: true });

  const results: { filename: string; ok: boolean; reason?: string }[] = [];

  for (const file of files) {
    const originalName = file.originalname || 'upload';
    try {
      const text = await extractTextFromBuffer(file.buffer, file.mimetype, originalName);
      if (!text?.trim()) {
        results.push({ filename: originalName, ok: false, reason: 'Could not extract text' });
        continue;
      }
      const safe = originalName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 60);
      const filename = `${safe}.md`;
      const filePath = path.join(INBOX_DIR, filename);
      await fs.writeFile(filePath, `# ${safe}\n\n${text.trim()}`, 'utf-8');
      results.push({ filename, ok: true });
    } catch (err) {
      results.push({ filename: originalName, ok: false, reason: (err as Error).message });
    }
  }

  const added = results.filter(r => r.ok).length;
  res.status(added > 0 ? 201 : 400).json({ added, results });
});

// POST /admin/rag/platform-kb/upload
router.post('/platform-kb/upload', inboxUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'No file provided' }); return; }

  const { buffer, mimetype, originalname } = req.file;
  const text = await extractTextFromBuffer(buffer, mimetype, originalname);
  if (!text || text.trim().length < 50) { res.status(422).json({ error: 'Could not extract usable text from this file' }); return; }

  const words = text.split(/\s+/);
  const CHUNK_SIZE = 400;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    chunks.push(words.slice(i, i + CHUNK_SIZE).join(' '));
  }

  const operators = await db
    .select({ id: operatorsTable.id, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(isNull(operatorsTable.deletedAt));

  let seeded = 0;
  for (const op of operators) {
    for (let idx = 0; idx < chunks.length; idx++) {
      const embedding = await embed(chunks[idx]);
      const vecStr = `[${embedding.join(',')}]`;
      const id = `plat-upload-${originalname.replace(/\W/g, '-')}-${idx}-${op.id}`.slice(0, 120);
      await pool.query(
        `INSERT INTO operator_kb
           (id, operator_id, owner_id, content, embedding, source_name,
            source_trust_level, confidence_score, intake_tags, is_pipeline_intake,
            privacy_cleared, content_cleared, is_system, verification_status, chunk_index, created_at)
         VALUES ($1,$2,$3,$4,$5::vector,$6,'platform',90,'{}',false,true,true,true,'active',$7,NOW())
         ON CONFLICT (id) DO NOTHING`,
        [id, op.id, op.ownerId, chunks[idx], vecStr, `_upload:${originalname}`, idx],
      );
      seeded++;
    }
  }

  res.json({ ok: true, filename: originalname, chunks: chunks.length, operators: operators.length, total_inserted: seeded });
});

export default router;
