import { db } from '@workspace/db';
import { ragDnaTable, ragSourcesTable } from '@workspace/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { validateEntry, extractEntriesFromSource } from '../utils/vaelEngine.js';
import { fetchSource } from '../utils/ragSourceFetcher.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion, KB_MODEL } from '../utils/openrouter.js';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// ── L0-L4 taxonomy ────────────────────────────────────────────────────────────

const TAXONOMY_LAYERS = {
  L0: 'l0_ai_builder',
  L1: 'l1_foundation',
  L2: 'l2_behavioral',
  L3: 'l3_domain',
  L4: 'l4_platform',
} as const;

type TaxonomyLayer = typeof TAXONOMY_LAYERS[keyof typeof TAXONOMY_LAYERS];
const VALID_LAYERS = Object.values(TAXONOMY_LAYERS) as string[];

const VALID_ARCHETYPES = ['Advisor', 'Analyst', 'Executor', 'Catalyst', 'Expert', 'Mentor', 'Connector', 'Creator', 'Guardian', 'Builder'];

// ── Taxonomy classifier ───────────────────────────────────────────────────────

const TAXONOMY_PROMPT = `Classify this knowledge entry for the OpSoul DNA corpus.

Return JSON only:
{
  "layer": "l0_ai_builder" | "l1_foundation" | "l2_behavioral" | "l3_domain" | "l4_platform",
  "dna_scope": "general" | "specialty",
  "archetype_scope": [],
  "domain_tags": []
}

Layers:
- l0_ai_builder: HTTP, APIs, scraping, data formats, LLM control, tool chaining, code reading
- l1_foundation: reasoning, ethics, identity stability, communication principles
- l2_behavioral: per-archetype patterns — only if the content names a specific archetype
- l3_domain: domain/industry knowledge (UAE, Arabic, startups, legal, finance, etc.)
- l4_platform: OpSoul platform mechanics, GROW, lifecycle, drift, archetypes, values

Scope:
- general: applies across operators → set archetype_scope if archetype-specific, else []
- specialty: domain-specific → set domain_tags`;

async function classifyTaxonomy(content: string): Promise<{
  layer: TaxonomyLayer;
  dnaScope: 'general' | 'specialty';
  archetypeScope: string[];
  domainTags: string[];
}> {
  try {
    const res = await chatCompletion(
      [{ role: 'system', content: TAXONOMY_PROMPT }, { role: 'user', content: content.slice(0, 600) }],
      { model: KB_MODEL },
    );
    const parsed = JSON.parse(res.content.trim().replace(/```json\s*/g, '').replace(/```/g, ''));
    return {
      layer: VALID_LAYERS.includes(parsed.layer) ? parsed.layer as TaxonomyLayer : TAXONOMY_LAYERS.L1,
      dnaScope: parsed.dna_scope === 'specialty' ? 'specialty' : 'general',
      archetypeScope: Array.isArray(parsed.archetype_scope)
        ? parsed.archetype_scope.filter((a: string) => VALID_ARCHETYPES.includes(a))
        : [],
      domainTags: Array.isArray(parsed.domain_tags) ? parsed.domain_tags : [],
    };
  } catch {
    return { layer: TAXONOMY_LAYERS.L1, dnaScope: 'general', archetypeScope: [], domainTags: [] };
  }
}

// ── Budget timer ──────────────────────────────────────────────────────────────

class BudgetTimer {
  private startedAt = Date.now();
  constructor(private readonly budgetMs: number) {}
  remaining  = () => this.budgetMs - (Date.now() - this.startedAt);
  hasTime    = (minNeeded = 20_000) => this.remaining() > minNeeded;
  elapsedSec = () => ((Date.now() - this.startedAt) / 1000).toFixed(1);
}

const FULL_BUDGET_MS = 270_000; // 4.5 min
const FAST_BUDGET_MS =  55_000; // 55 sec

// ── Shared seed helper ────────────────────────────────────────────────────────

async function seedCandidate(candidate: {
  title: string;
  content: string;
  suggested_layer?: string;
  suggested_tags?: string[];
  suggested_confidence?: number;
}, sourceName: string, hintedLayer?: TaxonomyLayer | null): Promise<'seeded' | 'rejected' | 'duplicate' | 'error'> {
  try {
    const candidateLayer = (candidate.suggested_layer && VALID_LAYERS.includes(candidate.suggested_layer))
      ? candidate.suggested_layer as TaxonomyLayer
      : null;
    const resolvedLayer = hintedLayer ?? candidateLayer ?? TAXONOMY_LAYERS.L0;

    const validation = await validateEntry({
      title: candidate.title,
      content: candidate.content,
      layer: resolvedLayer,
      tags: candidate.suggested_tags ?? [],
      sourceName,
      confidence: candidate.suggested_confidence ?? 0.7,
    });

    if (validation.verdict === 'reject') return 'rejected';

    const finalContent = (validation.verdict === 'revise' && validation.revised_content)
      ? validation.revised_content
      : candidate.content;

    // Duplicate check via content hash
    const hash = Buffer.from(finalContent.slice(0, 200)).toString('base64').slice(0, 64);
    const [existing] = await db
      .select({ id: ragDnaTable.id })
      .from(ragDnaTable)
      .where(eq(ragDnaTable.sourceHash, hash))
      .limit(1);
    if (existing) return 'duplicate';

    const taxonomy = resolvedLayer
      ? { layer: resolvedLayer, dnaScope: 'general' as const, archetypeScope: [] as string[], domainTags: candidate.suggested_tags ?? [] }
      : await classifyTaxonomy(finalContent);

    const embedding = await embed(finalContent).catch(() => null);

    await db.insert(ragDnaTable).values({
      id: randomUUID(),
      layer: taxonomy.layer,
      title: candidate.title,
      content: finalContent,
      embedding: embedding ?? null,
      tags: candidate.suggested_tags ?? [],
      sourceName,
      sourceHash: hash,
      confidence: validation.confidence_suggested ?? candidate.suggested_confidence ?? 0.75,
      knowledgeStatus: 'current',
      dnaScope: taxonomy.dnaScope,
      archetypeScope: taxonomy.archetypeScope,
      domainTags: taxonomy.domainTags,
      isActive: true,
    }).onConflictDoNothing();

    return 'seeded';
  } catch {
    return 'error';
  }
}

// ── Phase 1: Validate drafts ──────────────────────────────────────────────────

async function runValidationPhase(timer: BudgetTimer): Promise<{
  validated: number; approved: number; revised: number; rejected: number;
}> {
  const stats = { validated: 0, approved: 0, revised: 0, rejected: 0 };

  const drafts = await db
    .select({
      id: ragDnaTable.id,
      title: ragDnaTable.title,
      content: ragDnaTable.content,
      layer: ragDnaTable.layer,
      archetype: ragDnaTable.archetype,
      tags: ragDnaTable.tags,
      sourceName: ragDnaTable.sourceName,
      confidence: ragDnaTable.confidence,
    })
    .from(ragDnaTable)
    .where(and(eq(ragDnaTable.isActive, true), inArray(ragDnaTable.knowledgeStatus, ['draft'])))
    .limit(20);

  console.log(`[VAEL] Validation phase — ${drafts.length} draft entries to review`);

  for (const entry of drafts) {
    if (!timer.hasTime(25_000)) { console.log('[VAEL] Budget low — stopping validation early'); break; }

    try {
      const result = await validateEntry({
        title: entry.title,
        content: entry.content,
        layer: entry.layer,
        archetype: entry.archetype ?? undefined,
        tags: entry.tags ?? [],
        sourceName: entry.sourceName ?? undefined,
        confidence: entry.confidence ?? undefined,
      });

      stats.validated++;
      const updates: Partial<typeof ragDnaTable.$inferInsert> = { updatedAt: new Date() };

      if (result.verdict === 'approve') {
        updates.knowledgeStatus = 'current';
        updates.confidence = result.confidence_suggested;
        stats.approved++;
        console.log(`[VAEL] ✓ Approved: "${entry.title}"`);
      } else if (result.verdict === 'revise' && result.revised_content) {
        updates.content = result.revised_content;
        updates.knowledgeStatus = 'current';
        updates.confidence = result.confidence_suggested;
        try { updates.embedding = await embed(result.revised_content); } catch { /* keep old */ }
        stats.revised++;
        console.log(`[VAEL] ✎ Revised: "${entry.title}"`);
      } else if (result.verdict === 'reject') {
        updates.knowledgeStatus = 'deprecated';
        updates.isActive = false;
        stats.rejected++;
        console.log(`[VAEL] ✗ Rejected: "${entry.title}" — ${result.reasoning.slice(0, 80)}`);
      }

      await db.update(ragDnaTable).set(updates).where(eq(ragDnaTable.id, entry.id));
    } catch (err) {
      console.error(`[VAEL] Validation error on "${entry.title}":`, (err as Error).message);
    }
  }

  return stats;
}

// ── Phase 2: Knowledge Inbox (PRIMARY — admin submitted content) ──────────────

const INBOX_DIR      = path.resolve(process.cwd(), 'knowledge_inbox');
const PROCESSED_DIR  = path.join(INBOX_DIR, 'processed');

async function processKnowledgeInbox(timer: BudgetTimer): Promise<{
  filesRead: number; candidatesExtracted: number; seeded: number; rejected: number;
}> {
  const stats = { filesRead: 0, candidatesExtracted: 0, seeded: 0, rejected: 0 };

  let files: string[];
  try {
    await fs.mkdir(PROCESSED_DIR, { recursive: true });
    files = (await fs.readdir(INBOX_DIR)).filter(f => /\.(md|txt)$/i.test(f));
  } catch {
    return stats;
  }

  if (files.length === 0) return stats;
  console.log(`[VAEL] Inbox: ${files.length} file(s) to process`);

  for (const file of files) {
    if (!timer.hasTime(35_000)) { console.log('[VAEL] Budget low — stopping inbox early'); break; }

    let raw: string;
    try {
      raw = await fs.readFile(path.join(INBOX_DIR, file), 'utf-8');
    } catch { continue; }

    // Optional layer hint in the file: <!-- layer: l0_ai_builder -->
    const layerHintMatch = raw.match(/<!--\s*layer:\s*(l[0-4]_\w+)\s*-->/i);
    const hintedLayer = (layerHintMatch && VALID_LAYERS.includes(layerHintMatch[1]))
      ? layerHintMatch[1] as TaxonomyLayer
      : null;

    stats.filesRead++;
    const sourceTitle = file.replace(/\.(md|txt)$/i, '');

    let candidates: Awaited<ReturnType<typeof extractEntriesFromSource>>;
    try {
      candidates = await extractEntriesFromSource(raw.slice(0, 8_000), sourceTitle);
    } catch { candidates = []; }

    stats.candidatesExtracted += candidates.length;
    console.log(`[VAEL] "${sourceTitle}" — ${candidates.length} candidate(s) extracted`);

    for (const candidate of candidates) {
      if (!timer.hasTime(12_000)) break;
      const result = await seedCandidate(candidate, `inbox:${file}`, hintedLayer);
      if (result === 'seeded') {
        stats.seeded++;
        console.log(`[VAEL] ✓ Seeded: "${candidate.title}" [${hintedLayer ?? candidate.suggested_layer ?? 'auto'}]`);
      } else if (result === 'rejected') {
        stats.rejected++;
        console.log(`[VAEL] ✗ Rejected: "${candidate.title}"`);
      }
    }

    // Move to processed/
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.rename(path.join(INBOX_DIR, file), path.join(PROCESSED_DIR, `${stamp}_${file}`));
    } catch { /* best effort */ }
  }

  console.log(`[VAEL] Inbox done — files=${stats.filesRead} candidates=${stats.candidatesExtracted} seeded=${stats.seeded} rejected=${stats.rejected}`);
  return stats;
}

// ── Phase 3: Source-guided scan (SECONDARY — admin-configured sources) ────────

async function runSourceGuidedPhase(timer: BudgetTimer): Promise<{
  sourcesVisited: number; candidatesExtracted: number; seeded: number;
}> {
  const stats = { sourcesVisited: 0, candidatesExtracted: 0, seeded: 0 };

  const sources = await db
    .select()
    .from(ragSourcesTable)
    .where(eq(ragSourcesTable.isActive, true));

  if (sources.length === 0) return stats;
  console.log(`[VAEL] Source scan — ${sources.length} active source(s)`);

  for (const source of sources) {
    if (!timer.hasTime(45_000)) { console.log('[VAEL] Budget low — stopping source scan early'); break; }

    console.log(`[VAEL] Fetching source: "${source.name}"`);
    let chunks;
    try {
      chunks = await fetchSource(source.sourceType as any, source.url);
    } catch (err) {
      console.error(`[VAEL] Source fetch failed "${source.name}":`, (err as Error).message);
      continue;
    }

    const batched = chunks.slice(0, 8).map(c => `## ${c.title}\n${c.rawContent}`).join('\n\n---\n\n');
    let candidates: Awaited<ReturnType<typeof extractEntriesFromSource>>;
    try {
      candidates = await extractEntriesFromSource(batched, source.name);
    } catch { continue; }

    stats.sourcesVisited++;
    stats.candidatesExtracted += candidates.length;
    console.log(`[VAEL] "${source.name}" — ${candidates.length} candidate(s)`);

    for (const candidate of candidates) {
      if (!timer.hasTime(20_000)) break;
      const result = await seedCandidate(candidate, source.name);
      if (result === 'seeded') {
        stats.seeded++;
        console.log(`[VAEL] ✓ Source seeded: "${candidate.title}"`);
      }
    }

    await db.update(ragSourcesTable)
      .set({ lastFetchAt: new Date(), lastFetchCount: stats.seeded })
      .where(eq(ragSourcesTable.id, source.id));
  }

  return stats;
}

// ── Run state ─────────────────────────────────────────────────────────────────

export interface VaelRunState {
  isRunning: boolean;
  lastRunType: 'full' | 'validate' | null;
  lastRunAt: string | null;
  lastRunDurationSec: number | null;
  lastRunSummary: string | null;
  sweepSchedule: string;
  validateSchedule: string;
}

const state: VaelRunState = {
  isRunning: false,
  lastRunType: null,
  lastRunAt: null,
  lastRunDurationSec: null,
  lastRunSummary: null,
  sweepSchedule:    process.env.VAEL_SWEEP_SCHEDULE    ?? '0 1,13 * * *',
  validateSchedule: process.env.VAEL_VALIDATE_SCHEDULE ?? '0 */6 * * *',
};

export function getVaelRunState(): VaelRunState {
  return { ...state };
}

// ── Full sweep: validate → inbox → sources ────────────────────────────────────

export async function runVaelFullSweep(): Promise<void> {
  if (state.isRunning) { console.log('[VAEL] Sweep already running — skipping'); return; }
  state.isRunning = true;
  const timer = new BudgetTimer(FULL_BUDGET_MS);
  console.log('[VAEL] Full sweep starting:', new Date().toISOString());

  try {
    // Phase 1: review drafts
    const validation = await runValidationPhase(timer);

    // Phase 2: inbox — gets priority over source scan
    let inbox = { filesRead: 0, candidatesExtracted: 0, seeded: 0, rejected: 0 };
    if (timer.hasTime(40_000)) {
      inbox = await processKnowledgeInbox(timer);
    } else {
      console.log('[VAEL] Budget too low — skipping inbox');
    }

    // Phase 3: source scan — secondary, uses remaining budget
    let sources = { sourcesVisited: 0, candidatesExtracted: 0, seeded: 0 };
    if (timer.hasTime(50_000)) {
      sources = await runSourceGuidedPhase(timer);
    } else {
      console.log('[VAEL] Budget too low — skipping source scan');
    }

    const summary =
      `validate: ${validation.approved} approved, ${validation.rejected} rejected | ` +
      `inbox: ${inbox.filesRead} files, ${inbox.seeded} seeded, ${inbox.rejected} rejected | ` +
      `sources: ${sources.sourcesVisited} visited, ${sources.seeded} seeded`;

    console.log(`[VAEL] Full sweep done in ${timer.elapsedSec()}s — ${summary}`);

    state.lastRunType        = 'full';
    state.lastRunAt          = new Date().toISOString();
    state.lastRunDurationSec = parseFloat(timer.elapsedSec());
    state.lastRunSummary     = summary;
  } finally {
    state.isRunning = false;
  }
}

// ── Validation-only cycle ─────────────────────────────────────────────────────

export async function runVaelValidationOnly(): Promise<void> {
  if (state.isRunning) { console.log('[VAEL] Sweep already running — skipping'); return; }
  state.isRunning = true;
  const timer = new BudgetTimer(FAST_BUDGET_MS);
  console.log('[VAEL] Validation cycle starting:', new Date().toISOString());

  try {
    const validation = await runValidationPhase(timer);
    const summary = `validate: ${validation.approved} approved, ${validation.revised} revised, ${validation.rejected} rejected`;

    console.log(`[VAEL] Validation done in ${timer.elapsedSec()}s — ${summary}`);

    state.lastRunType        = 'validate';
    state.lastRunAt          = new Date().toISOString();
    state.lastRunDurationSec = parseFloat(timer.elapsedSec());
    state.lastRunSummary     = summary;
  } finally {
    state.isRunning = false;
  }
}

// ── Cron registration ─────────────────────────────────────────────────────────

export function startVaelCron(): void {
  const SWEEP_SCHEDULE    = process.env.VAEL_SWEEP_SCHEDULE    ?? '0 1,13 * * *';
  const VALIDATE_SCHEDULE = process.env.VAEL_VALIDATE_SCHEDULE ?? '0 */6 * * *';

  console.log(`[VAEL] Full sweep cron scheduled: "${SWEEP_SCHEDULE}" (UTC) — validate + inbox + sources`);
  console.log(`[VAEL] Validation cron scheduled: "${VALIDATE_SCHEDULE}" (UTC) — draft review only`);

  import('node-cron').then(({ default: cron }) => {
    cron.schedule(SWEEP_SCHEDULE, () => {
      runVaelFullSweep().catch(err => console.error('[VAEL] Unhandled error in full sweep:', err));
    }, { timezone: 'UTC' });

    cron.schedule(VALIDATE_SCHEDULE, () => {
      runVaelValidationOnly().catch(err => console.error('[VAEL] Unhandled error in validation cycle:', err));
    }, { timezone: 'UTC' });
  }).catch(err => {
    console.error('[VAEL] Failed to start cron — node-cron not available:', err.message);
  });
}
