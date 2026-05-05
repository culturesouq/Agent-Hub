import { db } from '@workspace/db';
import { ragDnaTable, ragSourcesTable, tasksTable } from '@workspace/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { validateEntry, runDiscoverySweep, extractEntriesFromSource, type DiscoveryProposal } from '../utils/vaelEngine.js';
import { fetchSource } from '../utils/ragSourceFetcher.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion, KB_MODEL } from '../utils/openrouter.js';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const VAEL_OPERATOR_ID = '8668f6c9-f7cf-4c65-a36e-7dd278005950';

// ── Knowledge taxonomy ────────────────────────────────────────────────────────
// L0: AI builder skills — HTTP, APIs, scraping, LLM control, tool chaining, code reading
// L1: Foundation — how operators think, reason, communicate, ethical principles
// L2: Behavioral — per-archetype behavior patterns and decision frameworks
// L3: Domain — specialty domain knowledge (agriculture, finance, legal, etc.)
// L4: Platform — Opsoul platform docs and procedures

const TAXONOMY_LAYERS = {
  L0: 'l0_ai_builder',
  L1: 'l1_foundation',
  L2: 'l2_behavioral',
  L3: 'l3_domain',
  L4: 'l4_platform',
} as const;

type TaxonomyLayer = typeof TAXONOMY_LAYERS[keyof typeof TAXONOMY_LAYERS];

async function recordVaelRun(taskType: 'full_sweep' | 'validation', summary: string, durationSec: number): Promise<void> {
  try {
    const rows = await db.select().from(tasksTable).where(
      and(eq(tasksTable.operatorId, VAEL_OPERATOR_ID))
    );
    const task = rows.find(r => (r.payload as any)?.vaelTaskType === taskType);
    if (!task) return;
    const currentPayload = (task.payload as any) ?? {};
    await db.update(tasksTable).set({
      summary,
      completedAt: new Date(),
      payload: {
        ...currentPayload,
        lastRunAt: new Date().toISOString(),
        lastRunSummary: summary,
        lastRunDurationSec: durationSec,
      },
    }).where(eq(tasksTable.id, task.id));
  } catch (err) {
    console.error('[VAEL] Failed to record task run:', (err as Error).message);
  }
}

// ── Budget timer ──────────────────────────────────────────────────────────────

const FULL_BUDGET_MS  = 270_000; // 4.5 min — full sweep (validate + discover)
const FAST_BUDGET_MS  =  55_000; // 55 sec  — validate-only cycle

const VALID_ARCHETYPES = ['Advisor', 'Analyst', 'Executor', 'Catalyst', 'Expert', 'Mentor', 'Connector', 'Creator', 'Guardian', 'Builder'];

class BudgetTimer {
  private startedAt = Date.now();
  constructor(private readonly budgetMs: number) {}
  remaining   = ()  => this.budgetMs - (Date.now() - this.startedAt);
  hasTime     = (minNeeded = 20_000) => this.remaining() > minNeeded;
  elapsedSec  = ()  => ((Date.now() - this.startedAt) / 1000).toFixed(1);
}

// ── Taxonomy classifier ───────────────────────────────────────────────────────
// Vael classifies each entry by layer, scope, archetypes, and domain tags.

const TAXONOMY_PROMPT = `Classify this knowledge entry for the Opsoul platform DNA corpus.

Return JSON only:
{
  "layer": "l0_ai_builder" | "l1_foundation" | "l2_behavioral" | "l3_domain" | "l4_platform",
  "dna_scope": "general" | "specialty",
  "archetype_scope": ["Analyst"],
  "domain_tags": ["agriculture"]
}

Layer rules:
- "l0_ai_builder": HTTP requests, REST/GraphQL APIs, web scraping (allowed and blocked patterns), data formats (JSON/XML/CSV), LLM prompting and control, tool chaining, code reading and understanding
- "l1_foundation": How operators think, reason, communicate — core operating principles, ethics, universal guidelines that apply to all archetypes
- "l2_behavioral": Per-archetype behavior patterns, communication styles, decision frameworks specific to a named archetype
- "l3_domain": Specialty domain knowledge (e.g. agriculture, finance, legal, medical, engineering, hr, sales, marketing, education, technology)
- "l4_platform": Opsoul platform documentation, platform-specific procedures, feature explanations, platform APIs

DNA scope rules:
- "general": universal knowledge applicable across operators — set archetype_scope from [${VALID_ARCHETYPES.join(', ')}], or empty [] if truly universal
- "specialty": domain-specific — set domain_tags (e.g. agriculture, finance, legal, medical)`;

async function classifyTaxonomy(content: string): Promise<{
  layer: TaxonomyLayer;
  dnaScope: 'general' | 'specialty';
  archetypeScope: string[];
  domainTags: string[];
}> {
  try {
    const res = await chatCompletion(
      [
        { role: 'system', content: TAXONOMY_PROMPT },
        { role: 'user', content: content.slice(0, 600) },
      ],
      { model: KB_MODEL },
    );
    const parsed = JSON.parse(res.content.trim());
    const validLayers: TaxonomyLayer[] = Object.values(TAXONOMY_LAYERS);
    return {
      layer: validLayers.includes(parsed.layer) ? parsed.layer : TAXONOMY_LAYERS.L1,
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

// ── Phase 1: Validate draft/pending DNA entries ───────────────────────────────

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
    .where(and(
      eq(ragDnaTable.isActive, true),
      inArray(ragDnaTable.knowledgeStatus, ['draft']),
    ))
    .limit(20);

  console.log(`[VAEL] Validation phase — ${drafts.length} draft entries to review`);

  for (const entry of drafts) {
    if (!timer.hasTime(25_000)) {
      console.log('[VAEL] Budget low — stopping validation early');
      break;
    }

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

      const updates: Partial<typeof ragDnaTable.$inferInsert> = {
        confidence: result.confidence_suggested,
        knowledgeStatus: result.status_suggested,
        updatedAt: new Date(),
      };

      if (result.verdict === 'approve') {
        updates.knowledgeStatus = 'current';
        stats.approved++;
        console.log(`[VAEL] ✓ Approved: "${entry.title}"`);
      } else if (result.verdict === 'revise' && result.revised_content) {
        updates.content = result.revised_content;
        updates.knowledgeStatus = 'current';
        try { updates.embedding = await embed(result.revised_content); } catch { /* keep old */ }
        stats.revised++;
        console.log(`[VAEL] ✎ Revised + approved: "${entry.title}"`);
      } else if (result.verdict === 'reject') {
        updates.knowledgeStatus = 'deprecated';
        updates.isActive = false;
        stats.rejected++;
        console.log(`[VAEL] ✗ Rejected: "${entry.title}" — ${result.reasoning.slice(0, 100)}`);
      }

      await db.update(ragDnaTable).set(updates).where(eq(ragDnaTable.id, entry.id));
    } catch (err) {
      console.error(`[VAEL] Validation error on "${entry.title}":`, (err as Error).message);
    }
  }

  return stats;
}

// ── Phase 2: Discovery sweep + auto-seed ─────────────────────────────────────

async function seedProposal(proposal: DiscoveryProposal): Promise<boolean> {
  if (!proposal.content) return false;

  const validation = await validateEntry({
    title: proposal.title,
    content: proposal.content,
    layer: TAXONOMY_LAYERS.L1,
    tags: proposal.suggested_tags ?? [],
    sourceName: proposal.suggested_source_name,
    confidence: proposal.suggested_confidence,
  });

  if (validation.verdict === 'reject') {
    console.log(`[VAEL] Proposal rejected by self-validation: "${proposal.title}"`);
    return false;
  }

  const finalContent = (validation.verdict === 'revise' && validation.revised_content)
    ? validation.revised_content
    : proposal.content;

  const [taxonomy, embedding] = await Promise.all([
    classifyTaxonomy(finalContent),
    embed(finalContent).catch(() => undefined),
  ]);

  const hash = Buffer.from(finalContent.slice(0, 200)).toString('base64').slice(0, 64);

  const [existing] = await db
    .select({ id: ragDnaTable.id })
    .from(ragDnaTable)
    .where(eq(ragDnaTable.sourceHash, hash))
    .limit(1);

  if (existing) {
    console.log(`[VAEL] Duplicate detected — skipping: "${proposal.title}"`);
    return false;
  }

  await db.insert(ragDnaTable).values({
    id: randomUUID(),
    layer: taxonomy.layer,
    title: proposal.title,
    content: finalContent,
    embedding: embedding ?? null,
    tags: proposal.suggested_tags ?? [],
    sourceName: proposal.suggested_source_name ?? 'Vael Discovery',
    sourceHash: hash,
    confidence: validation.confidence_suggested ?? proposal.suggested_confidence,
    knowledgeStatus: 'current',
    dnaScope: taxonomy.dnaScope,
    archetypeScope: taxonomy.archetypeScope,
    domainTags: taxonomy.domainTags,
    isActive: true,
  });

  return true;
}

async function applyFlagProposal(proposal: DiscoveryProposal): Promise<void> {
  if (!proposal.affected_entry_title) return;

  const [entry] = await db
    .select({ id: ragDnaTable.id })
    .from(ragDnaTable)
    .where(and(
      eq(ragDnaTable.title, proposal.affected_entry_title),
      eq(ragDnaTable.isActive, true),
    ))
    .limit(1);

  if (!entry) return;

  await db.update(ragDnaTable)
    .set({
      knowledgeStatus: proposal.action === 'flag_deprecated' ? 'deprecated' : 'upgraded',
      updatedAt: new Date(),
    })
    .where(eq(ragDnaTable.id, entry.id));

  console.log(`[VAEL] Flagged "${proposal.affected_entry_title}" as ${proposal.action === 'flag_deprecated' ? 'deprecated' : 'upgraded'}`);
}

async function runDiscoveryPhase(timer: BudgetTimer): Promise<{
  proposed: number; seeded: number; flagged: number;
}> {
  const stats = { proposed: 0, seeded: 0, flagged: 0 };

  console.log('[VAEL] Discovery phase starting...');

  let sweep;
  try {
    sweep = await runDiscoverySweep();
  } catch (err) {
    console.error('[VAEL] Discovery sweep failed:', (err as Error).message);
    return stats;
  }

  stats.proposed = sweep.proposals.length;
  console.log(`[VAEL] Discovery found ${stats.proposed} proposals — ${sweep.summary}`);

  for (const proposal of sweep.proposals) {
    if (!timer.hasTime(30_000)) {
      console.log('[VAEL] Budget low — stopping discovery seeding early');
      break;
    }

    try {
      if (proposal.action === 'new_entry') {
        const seeded = await seedProposal(proposal);
        if (seeded) {
          stats.seeded++;
          console.log(`[VAEL] ✓ Seeded: "${proposal.title}"`);
        }
      } else if (proposal.action === 'flag_upgraded' || proposal.action === 'flag_deprecated') {
        await applyFlagProposal(proposal);
        stats.flagged++;
      }
    } catch (err) {
      console.error(`[VAEL] Error processing proposal "${proposal.title}":`, (err as Error).message);
    }
  }

  return stats;
}

// ── Phase 3: Source-guided discovery ──────────────────────────────────────────

async function runSourceGuidedPhase(timer: BudgetTimer): Promise<{
  sourcesVisited: number; candidatesExtracted: number; seeded: number;
}> {
  const stats = { sourcesVisited: 0, candidatesExtracted: 0, seeded: 0 };

  const sources = await db
    .select()
    .from(ragSourcesTable)
    .where(eq(ragSourcesTable.isActive, true));

  if (sources.length === 0) return stats;

  console.log(`[VAEL] Source-guided phase — ${sources.length} active source(s)`);

  for (const source of sources) {
    if (!timer.hasTime(45_000)) {
      console.log('[VAEL] Budget low — stopping source-guided phase early');
      break;
    }

    console.log(`[VAEL] Fetching source: "${source.name}" (${source.sourceType})`);
    let chunks;
    try {
      chunks = await fetchSource(source.sourceType as any, source.url);
    } catch (err) {
      console.error(`[VAEL] Source fetch failed for "${source.name}":`, (err as Error).message);
      continue;
    }

    const batched = chunks.slice(0, 8).map(c => `## ${c.title}\n${c.rawContent}`).join('\n\n---\n\n');
    let candidates;
    try {
      candidates = await extractEntriesFromSource(batched, source.name);
    } catch (err) {
      console.error(`[VAEL] Extraction failed for "${source.name}":`, (err as Error).message);
      continue;
    }

    stats.sourcesVisited++;
    stats.candidatesExtracted += candidates.length;
    console.log(`[VAEL] "${source.name}" — ${candidates.length} candidate(s) extracted`);

    for (const candidate of candidates) {
      if (!timer.hasTime(25_000)) break;

      try {
        const validation = await validateEntry({
          title: candidate.title,
          content: candidate.content,
          layer: TAXONOMY_LAYERS.L1,
          tags: candidate.suggested_tags ?? [],
          sourceName: source.name,
          confidence: candidate.suggested_confidence,
        });

        if (validation.verdict === 'reject') {
          console.log(`[VAEL] Source candidate rejected: "${candidate.title}"`);
          continue;
        }

        const finalContent = (validation.verdict === 'revise' && validation.revised_content)
          ? validation.revised_content
          : candidate.content;

        const hash = Buffer.from(finalContent.slice(0, 200)).toString('base64').slice(0, 64);
        const [existing] = await db
          .select({ id: ragDnaTable.id })
          .from(ragDnaTable)
          .where(eq(ragDnaTable.sourceHash, hash))
          .limit(1);

        if (existing) continue;

        const [taxonomy, embedding] = await Promise.all([
          classifyTaxonomy(finalContent),
          embed(finalContent).catch(() => undefined),
        ]);

        await db.insert(ragDnaTable).values({
          id: randomUUID(),
          layer: taxonomy.layer,
          title: candidate.title,
          content: finalContent,
          embedding: embedding ?? null,
          tags: candidate.suggested_tags ?? [],
          sourceName: source.name,
          sourceHash: hash,
          confidence: validation.confidence_suggested ?? candidate.suggested_confidence,
          knowledgeStatus: 'current',
          dnaScope: taxonomy.dnaScope,
          archetypeScope: taxonomy.archetypeScope,
          domainTags: taxonomy.domainTags,
          isActive: true,
        });

        stats.seeded++;
        console.log(`[VAEL] ✓ Seeded from source: "${candidate.title}" [${taxonomy.layer}]`);
      } catch (err) {
        console.error(`[VAEL] Source candidate error: "${candidate.title}":`, (err as Error).message);
      }
    }

    await db
      .update(ragSourcesTable)
      .set({ lastFetchAt: new Date(), lastFetchCount: stats.seeded })
      .where(eq(ragSourcesTable.id, source.id));
  }

  return stats;
}

// ── Knowledge Inbox ───────────────────────────────────────────────────────────
// Vael reads every file dropped into knowledge_inbox/, validates each candidate,
// classifies it into the L0-L4 taxonomy, and seeds what passes.

const INBOX_DIR = path.resolve(process.cwd(), 'knowledge_inbox');
const PROCESSED_DIR = path.join(INBOX_DIR, 'processed');

async function processKnowledgeInbox(timer: BudgetTimer): Promise<{ filesRead: number; candidatesExtracted: number; seeded: number }> {
  const stats = { filesRead: 0, candidatesExtracted: 0, seeded: 0 };

  let files: string[];
  try {
    await fs.mkdir(PROCESSED_DIR, { recursive: true });
    files = (await fs.readdir(INBOX_DIR)).filter(f => /\.(md|txt)$/i.test(f));
  } catch {
    return stats;
  }

  if (files.length === 0) return stats;
  console.log(`[VAEL] Inbox: ${files.length} file(s) to read`);

  for (const file of files) {
    if (!timer.hasTime(30_000)) break;

    const filePath = path.join(INBOX_DIR, file);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Check for layer hint in frontmatter: <!-- layer: l0_ai_builder -->
    const layerHintMatch = raw.match(/<!--\s*layer:\s*(l[0-4]_\w+)\s*-->/i);
    const hintedLayer = layerHintMatch ? layerHintMatch[1] as TaxonomyLayer : null;

    const content = raw.slice(0, 8_000);
    stats.filesRead++;

    let candidates: Awaited<ReturnType<typeof extractEntriesFromSource>>;
    try {
      candidates = await extractEntriesFromSource(content, file.replace(/\.(md|txt)$/i, ''));
    } catch {
      candidates = [];
    }

    stats.candidatesExtracted += candidates.length;

    for (const candidate of candidates) {
      if (!timer.hasTime(10_000)) break;
      try {
        const validation = await validateEntry({
          title: candidate.title,
          content: candidate.content,
          tags: candidate.suggested_tags ?? [],
          layer: hintedLayer ?? TAXONOMY_LAYERS.L1,
          confidence: candidate.suggested_confidence ?? 0.7,
        });

        if (validation.verdict !== 'approve' && validation.verdict !== 'revise') continue;

        const finalContent = validation.verdict === 'revise' && validation.revised_content
          ? validation.revised_content
          : candidate.content;

        // Use layer hint from file if present, otherwise classify
        const taxonomy = hintedLayer
          ? { layer: hintedLayer, dnaScope: 'general' as const, archetypeScope: [] as string[], domainTags: candidate.suggested_tags ?? [] }
          : await classifyTaxonomy(finalContent);

        const embedding = await embed(finalContent).catch(() => null);

        await db.insert(ragDnaTable).values({
          id: randomUUID(),
          layer: taxonomy.layer,
          title: candidate.title,
          content: finalContent,
          embedding: embedding ?? null,
          tags: candidate.suggested_tags ?? [],
          sourceName: `inbox:${file}`,
          confidence: validation.confidence_suggested ?? candidate.suggested_confidence ?? 0.75,
          knowledgeStatus: 'current',
          dnaScope: taxonomy.dnaScope,
          archetypeScope: taxonomy.archetypeScope,
          domainTags: taxonomy.domainTags,
          isActive: true,
        }).onConflictDoNothing();

        stats.seeded++;
        console.log(`[VAEL] ✓ Inbox seeded: "${candidate.title}" [${taxonomy.layer}]`);
      } catch (err) {
        console.error(`[VAEL] Inbox candidate error: "${candidate.title}":`, (err as Error).message);
      }
    }

    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.rename(filePath, path.join(PROCESSED_DIR, `${stamp}_${file}`));
    } catch { /* best effort */ }
  }

  console.log(`[VAEL] Inbox done — read=${stats.filesRead} candidates=${stats.candidatesExtracted} seeded=${stats.seeded}`);
  return stats;
}

// ── Run state (in-memory, resets on restart) ──────────────────────────────────

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
  sweepSchedule: process.env.VAEL_SWEEP_SCHEDULE    ?? '0 1,13 * * *',
  validateSchedule: process.env.VAEL_VALIDATE_SCHEDULE ?? '0 */6 * * *',
};

export function getVaelRunState(): VaelRunState {
  return { ...state };
}

// ── Full sweep ────────────────────────────────────────────────────────────────

export async function runVaelFullSweep(): Promise<void> {
  if (state.isRunning) {
    console.log('[VAEL] Sweep already in progress — skipping');
    return;
  }
  state.isRunning = true;
  const timer = new BudgetTimer(FULL_BUDGET_MS);
  console.log('[VAEL] Full sweep starting:', new Date().toISOString());

  try {
    const validation = await runValidationPhase(timer);

    let discovery = { proposed: 0, seeded: 0, flagged: 0 };
    if (timer.hasTime(60_000)) {
      discovery = await runDiscoveryPhase(timer);
    } else {
      console.log('[VAEL] Budget too low after validation — skipping discovery');
    }

    let sources = { sourcesVisited: 0, candidatesExtracted: 0, seeded: 0 };
    if (timer.hasTime(50_000)) {
      sources = await runSourceGuidedPhase(timer);
    } else {
      console.log('[VAEL] Budget too low after discovery — skipping source-guided phase');
    }

    let inbox = { filesRead: 0, candidatesExtracted: 0, seeded: 0 };
    if (timer.hasTime(40_000)) {
      inbox = await processKnowledgeInbox(timer);
    } else {
      console.log('[VAEL] Budget too low — skipping inbox');
    }

    const summary =
      `validated=${validation.validated} approved=${validation.approved} revised=${validation.revised} rejected=${validation.rejected} | ` +
      `proposed=${discovery.proposed} seeded=${discovery.seeded} flagged=${discovery.flagged} | ` +
      `inbox_files=${inbox.filesRead} inbox_seeded=${inbox.seeded}`;

    console.log(`[VAEL] Full sweep done in ${timer.elapsedSec()}s — ${summary}`);

    state.lastRunType        = 'full';
    state.lastRunAt          = new Date().toISOString();
    state.lastRunDurationSec = parseFloat(timer.elapsedSec());
    state.lastRunSummary     = summary;
    await recordVaelRun('full_sweep', summary, parseFloat(timer.elapsedSec()));
  } finally {
    state.isRunning = false;
  }
}

export async function runVaelValidationOnly(): Promise<void> {
  if (state.isRunning) {
    console.log('[VAEL] Sweep already in progress — skipping');
    return;
  }
  state.isRunning = true;
  const timer = new BudgetTimer(FAST_BUDGET_MS);
  console.log('[VAEL] Validation-only cycle starting:', new Date().toISOString());

  try {
    const validation = await runValidationPhase(timer);
    const summary =
      `validated=${validation.validated} approved=${validation.approved} revised=${validation.revised} rejected=${validation.rejected}`;

    console.log(`[VAEL] Validation done in ${timer.elapsedSec()}s — ${summary}`);

    state.lastRunType        = 'validate';
    state.lastRunAt          = new Date().toISOString();
    state.lastRunDurationSec = parseFloat(timer.elapsedSec());
    state.lastRunSummary     = summary;
    await recordVaelRun('validation', summary, parseFloat(timer.elapsedSec()));
  } finally {
    state.isRunning = false;
  }
}

// ── Cron registration ─────────────────────────────────────────────────────────

export function startVaelCron(): void {
  const SWEEP_SCHEDULE    = process.env.VAEL_SWEEP_SCHEDULE    ?? '0 1,13 * * *';
  const VALIDATE_SCHEDULE = process.env.VAEL_VALIDATE_SCHEDULE ?? '0 */6 * * *';

  console.log(`[VAEL] Full sweep cron scheduled: "${SWEEP_SCHEDULE}" (UTC) — validate + discover + seed`);
  console.log(`[VAEL] Validation cron scheduled: "${VALIDATE_SCHEDULE}" (UTC) — draft review only`);

  import('node-cron').then(({ default: cron }) => {
    cron.schedule(SWEEP_SCHEDULE, () => {
      runVaelFullSweep().catch((err) => {
        console.error('[VAEL] Unhandled error in full sweep:', err);
      });
    }, { timezone: 'UTC' });

    cron.schedule(VALIDATE_SCHEDULE, () => {
      runVaelValidationOnly().catch((err) => {
        console.error('[VAEL] Unhandled error in validation cycle:', err);
      });
    }, { timezone: 'UTC' });

  }).catch((err) => {
    console.error('[VAEL] Failed to start cron — node-cron not available:', err.message);
  });
}
