import { Router, type Request, type Response } from 'express';
import { db, pool, ragDnaTable, ragPipelineConfigTable, operatorKbTable, ragSourcesTable, operatorsTable, kbVerificationRunsTable } from "@workspace/db";
import type { RagSourceType } from '@workspace/db';
import { eq, and, sql, desc, isNull, or, notInArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion, KB_MODEL } from '../utils/openrouter.js';

import { validateEntry } from '../utils/vaelEngine.js';
import { runVaelFullSweep, runVaelValidationOnly, getVaelRunState } from '../cron/vaelCron.js';
import multer from 'multer';
import * as cheerio from 'cheerio';

const INBOX_DIR     = path.resolve(process.cwd(), 'knowledge_inbox');
const PROCESSED_DIR = path.join(INBOX_DIR, 'processed');

const TEXT_EXTS = new Set(['.txt','.md','.markdown','.csv','.json','.log','.yaml','.yml','.toml','.ini','.html','.htm','.xml','.rst','.jsonl','.tsv','.ndjson']);

function extOf(name: string) { return ('.' + name.split('.').pop()!.toLowerCase()); }

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function scrapeHtml(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, footer, header, aside, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
  const text = $('body').text()
    .replace(/\s{2,}/g, ' ')
    .trim();
  return text || stripHtml(html);
}

function chunkText(text: string, chunkWords = 800, overlapWords = 100): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + chunkWords).join(' '));
    i += chunkWords - overlapWords;
    if (i + overlapWords >= words.length) break;
  }
  if (chunks.length === 0 && words.length > 0) chunks.push(words.join(' '));
  return chunks;
}

async function extractTextFromBuffer(buffer: Buffer, mimetype: string, filename: string): Promise<string | null> {
  const ext = extOf(filename);

  // XLSX / XLS
  if (ext === '.xlsx' || ext === '.xls'
      || mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || mimetype === 'application/vnd.ms-excel') {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const csvRows = workbook.SheetNames.map(name =>
      XLSX.utils.sheet_to_csv(workbook.Sheets[name])
    );
    return csvRows.join('\n\n');
  }

  // JSONL / NDJSON — extract values from each line
  if (ext === '.jsonl' || ext === '.ndjson') {
    const lines = buffer.toString('utf-8').split('\n').filter(Boolean);
    const texts = lines.map(line => {
      try {
        const obj = JSON.parse(line);
        return Object.values(obj).filter(v => typeof v === 'string').join(' ');
      } catch { return line; }
    });
    return texts.join('\n');
  }

  // Plain text / structured text formats
  if (TEXT_EXTS.has(ext) || mimetype.startsWith('text/')) return buffer.toString('utf-8');

  // PDF
  if (mimetype === 'application/pdf' || ext === '.pdf') {
    const pdfParse = (await import('pdf-parse') as unknown as { default: (buf: Buffer) => Promise<{ text: string }> }).default;
    const data = await pdfParse(buffer);
    return data.text;
  }

  // DOCX
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // Legacy .doc — not supported
  if (mimetype === 'application/msword' || ext === '.doc') return null;

  // Best-effort UTF-8 fallback for any other format
  return buffer.toString('utf-8');
}

const inboxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

// ── Pipeline content screener ────────────────────────────────────────────────

const VALID_ARCHETYPES_LIST = ['Advisor', 'Analyst', 'Executor', 'Catalyst', 'Expert', 'Mentor', 'Connector', 'Creator', 'Guardian', 'Builder'];

// ── Operators permanently excluded from collective pipeline extraction ─────────
const PIPELINE_EXCLUDED_OPERATORS = [
  '8668f6c9-f7cf-4c65-a36e-7dd278005950', // Vael — internal validator, does not contribute to collective
];

const SCREENER_SYSTEM = `You are Vael, the knowledge gatekeeper for Opsoul. Your job is to validate entries for the platform DNA corpus.

The corpus is organized into 5 taxonomy layers:
- l0_ai_builder: HTTP, REST/GraphQL APIs, web scraping (allowed + blocked), data formats (JSON/XML/CSV), LLM prompting and control, tool chaining, code reading
- l1_foundation: How operators think, reason, communicate — core operating principles, ethics, universal guidelines
- l2_behavioral: Per-archetype behavior patterns, communication styles, decision frameworks
- l3_domain: Specialty domain knowledge (agriculture, finance, legal, medical, engineering, etc.)
- l4_platform: Opsoul platform docs, operator lifecycle, GROW system, self-awareness engine, archetype principles

For each entry, determine if it is eligible for the DNA corpus and classify its layer.

Return only valid JSON. No preamble.

Schema:
{
  "eligible": true | false,
  "reason": "<only if not eligible>",
  "layer": "l0_ai_builder" | "l1_foundation" | "l2_behavioral" | "l3_domain" | "l4_platform",
  "dna_scope": "general" | "specialty",
  "archetype_scope": ["Analyst", "Expert"],
  "domain_tags": ["agriculture", "finance"]
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

const VALID_LAYERS = ['l0_ai_builder', 'l1_foundation', 'l2_behavioral', 'l3_domain', 'l4_platform'] as const;
const VALID_ARCHETYPES = [
  'Advisor', 'Executor', 'Expert', 'Connector', 'Creator',
  'Guardian', 'Builder', 'Catalyst', 'Analyst',
];

// ── Stats ──────────────────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  const [[l0], [l1], [l2], [l3], [l4], [totalActive]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(ragDnaTable)
      .where(and(eq(ragDnaTable.layer, 'l0_ai_builder'), eq(ragDnaTable.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(ragDnaTable)
      .where(and(eq(ragDnaTable.layer, 'l1_foundation'), eq(ragDnaTable.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(ragDnaTable)
      .where(and(eq(ragDnaTable.layer, 'l2_behavioral'), eq(ragDnaTable.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(ragDnaTable)
      .where(and(eq(ragDnaTable.layer, 'l3_domain'), eq(ragDnaTable.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(ragDnaTable)
      .where(and(eq(ragDnaTable.layer, 'l4_platform'), eq(ragDnaTable.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(ragDnaTable)
      .where(eq(ragDnaTable.isActive, true)),
  ]);

  const [config] = await db.select().from(ragPipelineConfigTable).limit(1);

  res.json({
    l0Count: l0.count,
    l1Count: l1.count,
    l2Count: l2.count,
    l3Count: l3.count,
    l4Count: l4.count,
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
  if (active === 'false') conditions.push(eq(ragDnaTable.isActive, false));
  else conditions.push(eq(ragDnaTable.isActive, true)); // default: active only
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
  const [existing] = await db.select({ id: ragDnaTable.id }).from(ragDnaTable).where(eq(ragDnaTable.id, id));
  if (!existing) { res.status(404).json({ error: 'Entry not found' }); return; }
  await db.delete(ragDnaTable).where(eq(ragDnaTable.id, id));
  res.json({ ok: true, deleted: id });
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

// ── VAEL Status & Trigger ──────────────────────────────────────────────────

router.get('/vael/status', (_req: Request, res: Response): void => {
  res.json(getVaelRunState());
});

router.post('/vael/trigger', async (req: Request, res: Response): Promise<void> => {
  const { mode } = req.body as { mode?: 'full' | 'validate' };
  const st = getVaelRunState();
  if (st.isRunning) {
    res.status(409).json({ ok: false, message: 'VAEL sweep already in progress' });
    return;
  }
  const sweep = mode === 'validate' ? runVaelValidationOnly : runVaelFullSweep;
  sweep().catch((err) => console.error('[VAEL] Trigger error:', err));
  res.json({ ok: true, mode: mode ?? 'full', message: 'VAEL sweep triggered' });
});

// POST /admin/rag/vael/inbox-url — scrape URL and drop into VAEL inbox
router.post('/vael/inbox-url', async (req: Request, res: Response): Promise<void> => {
  const { url, label } = req.body as { url?: string; label?: string };
  if (!url?.trim() || !/^https?:\/\//i.test(url.trim())) {
    res.status(400).json({ error: 'A valid http/https URL is required' });
    return;
  }
  const targetUrl = url.trim();
  const sourceLabel = label?.trim() || new URL(targetUrl).hostname;

  let fetchRes: globalThis.Response;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 30_000);
    fetchRes = await fetch(targetUrl, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,*/*;q=0.8' },
    });
    clearTimeout(tid);
  } catch (err) {
    res.json({ ok: false, error: 'Fetch failed: ' + (err as Error).message });
    return;
  }

  if (!fetchRes.ok) {
    res.json({ ok: false, error: 'HTTP ' + fetchRes.status });
    return;
  }

  const rawHtml = await fetchRes.text();
  const text = scrapeHtml(rawHtml);
  if (!text || text.trim().length < 50) {
    res.json({ ok: false, error: 'Could not extract usable text from URL' });
    return;
  }

  try {
    await fs.mkdir(INBOX_DIR, { recursive: true });
    const safe = sourceLabel.replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 60);
    const filename = `${safe}.md`;
    const filePath = path.join(INBOX_DIR, filename);
    await fs.writeFile(filePath, `# ${safe}\n\nSource: ${targetUrl}\n\n${text.trim().slice(0, 20000)}`, 'utf-8');
    res.status(201).json({ ok: true, filename, chars: text.length });
  } catch (e) {
    res.status(500).json({ error: 'Could not write to inbox', detail: (e as Error).message });
  }
});

// POST /admin/rag/vael/inbox-text — submit raw text to VAEL inbox
router.post('/vael/inbox-text', async (req: Request, res: Response): Promise<void> => {
  const { content: textContent, label } = req.body as { content?: string; label?: string };
  if (!textContent?.trim() || !label?.trim()) {
    res.status(400).json({ error: 'content and label are required' });
    return;
  }
  try {
    await fs.mkdir(INBOX_DIR, { recursive: true });
    const safe = label.trim().replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 60);
    const filename = `${safe}.md`;
    const filePath = path.join(INBOX_DIR, filename);
    await fs.writeFile(filePath, `# ${safe}\n\n${textContent.trim()}`, 'utf-8');
    res.status(201).json({ ok: true, filename });
  } catch (e) {
    res.status(500).json({ error: 'Could not write to inbox', detail: (e as Error).message });
  }
});

// POST /admin/rag/vael/inbox-bulk-url — queue multiple URLs at once
router.post('/vael/inbox-bulk-url', async (req: Request, res: Response): Promise<void> => {
  const { urls, label } = req.body as { urls?: string[]; label?: string };
  if (!Array.isArray(urls) || urls.length === 0) {
    res.status(400).json({ error: 'urls array is required' });
    return;
  }
  const validUrls = urls.map(u => u?.trim()).filter(u => u && /^https?:\/\//i.test(u));
  if (validUrls.length === 0) {
    res.status(400).json({ error: 'No valid http/https URLs provided' });
    return;
  }
  await fs.mkdir(INBOX_DIR, { recursive: true });

  const CONCURRENCY = 5;
  const results: { url: string; ok: boolean; filename?: string; error?: string }[] = [];

  for (let i = 0; i < validUrls.length; i += CONCURRENCY) {
    const batch = validUrls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (targetUrl) => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 30_000);
        const fetchRes = await fetch(targetUrl, {
          signal: ctrl.signal,
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,*/*;q=0.8' },
        });
        clearTimeout(tid);
        if (!fetchRes.ok) return { url: targetUrl, ok: false, error: `HTTP ${fetchRes.status}` };
        const rawHtml = await fetchRes.text();
        const text = scrapeHtml(rawHtml);
        if (!text || text.trim().length < 50) return { url: targetUrl, ok: false, error: 'Too little text extracted' };
        const hostname = new URL(targetUrl).hostname;
        const sourceLabel = (label?.trim() || hostname).replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 40);
        const suffix = Date.now().toString(36);
        const filename = `${sourceLabel}_${suffix}.md`;
        await fs.writeFile(path.join(INBOX_DIR, filename), `# ${sourceLabel}\n\nSource: ${targetUrl}\n\n${text.trim().slice(0, 20000)}`, 'utf-8');
        return { url: targetUrl, ok: true, filename };
      } catch (err) {
        return { url: targetUrl, ok: false, error: (err as Error).message };
      }
    }));
    results.push(...batchResults);
  }

  const queued = results.filter(r => r.ok).length;
  res.status(queued > 0 ? 201 : 400).json({ queued, total: validUrls.length, results });
});

// POST /admin/rag/vael/inbox-insights — extract structured insights from long text via LLM
router.post('/vael/inbox-insights', async (req: Request, res: Response): Promise<void> => {
  const { content: textContent, label } = req.body as { content?: string; label?: string };
  if (!textContent?.trim() || !label?.trim()) {
    res.status(400).json({ error: 'content and label are required' });
    return;
  }
  if (textContent.trim().length < 100) {
    res.status(400).json({ error: 'Text too short to extract insights from' });
    return;
  }

  const systemPrompt = `You are an insight extractor. Given a piece of text, extract discrete, self-contained knowledge insights.
Each insight must be:
- A complete, standalone fact or principle (not a fragment)
- Useful for an AI operator as background knowledge
- 2-5 sentences maximum

Return a JSON array of objects: [{"title": "short title", "insight": "the full insight text"}, ...]
Extract between 3 and 15 insights. Do not include fluff, introductions, or meta-commentary.`;

  let insights: { title: string; insight: string }[] = [];
  try {
    const llmResponse = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Source label: ${label.trim()}\n\nText:\n${textContent.trim().slice(0, 15000)}` },
    ]);
    const raw = llmResponse.content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    insights = JSON.parse(raw);
    if (!Array.isArray(insights)) throw new Error('Not an array');
  } catch (err) {
    res.status(500).json({ error: 'LLM insight extraction failed', detail: (err as Error).message });
    return;
  }

  await fs.mkdir(INBOX_DIR, { recursive: true });
  const results: { title: string; filename: string; ok: boolean; error?: string }[] = [];
  const baseLabel = label.trim().replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 40);

  for (let i = 0; i < insights.length; i++) {
    const item = insights[i];
    if (!item?.title || !item?.insight) continue;
    try {
      const titleSafe = item.title.replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 50);
      const filename = `${baseLabel}_insight_${i + 1}_${titleSafe}.md`;
      const body = `# ${item.title}\n\nSource: ${label.trim()} (insight ${i + 1}/${insights.length})\n\n${item.insight.trim()}`;
      await fs.writeFile(path.join(INBOX_DIR, filename), body, 'utf-8');
      results.push({ title: item.title, filename, ok: true });
    } catch (err) {
      results.push({ title: item.title || `insight_${i}`, filename: '', ok: false, error: (err as Error).message });
    }
  }

  const written = results.filter(r => r.ok).length;
  res.status(written > 0 ? 201 : 400).json({ extracted: insights.length, written, results });
});

// GET /admin/rag/vael/runs — kb_verification_runs history
router.get('/vael/runs', async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
  const runs = await db
    .select()
    .from(kbVerificationRunsTable)
    .orderBy(desc(kbVerificationRunsTable.createdAt))
    .limit(limit);
  res.json(runs);
});

// PATCH /admin/rag/entries/:id — quick patch status, confidence, isActive
router.patch('/entries/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { knowledgeStatus, confidence, isActive } = req.body as {
    knowledgeStatus?: 'current' | 'upgraded' | 'deprecated' | 'draft';
    confidence?: number;
    isActive?: boolean;
  };

  const [existing] = await db.select({ id: ragDnaTable.id }).from(ragDnaTable).where(eq(ragDnaTable.id, id));
  if (!existing) { res.status(404).json({ error: 'Entry not found' }); return; }

  const updates: Partial<typeof ragDnaTable.$inferInsert> = { updatedAt: new Date() };
  if (knowledgeStatus !== undefined) updates.knowledgeStatus = knowledgeStatus;
  if (confidence !== undefined) updates.confidence = confidence;
  if (isActive !== undefined) updates.isActive = isActive;

  const [updated] = await db.update(ragDnaTable).set(updates).where(eq(ragDnaTable.id, id)).returning({
    id: ragDnaTable.id,
    knowledgeStatus: ragDnaTable.knowledgeStatus,
    confidence: ragDnaTable.confidence,
    isActive: ragDnaTable.isActive,
  });
  res.json(updated);
});

export default router;
