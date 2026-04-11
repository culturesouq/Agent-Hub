import { db } from '@workspace/db';
import { ragDnaTable } from '@workspace/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { validateEntry, runDiscoverySweep, type DiscoveryProposal } from '../utils/vaelEngine.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion, KB_MODEL } from '../utils/openrouter.js';
import { randomUUID } from 'crypto';

// ── Budget timer ──────────────────────────────────────────────────────────────
// Vael races the clock — she does as much as she can before the budget runs out.

const FULL_BUDGET_MS  = 270_000; // 4.5 min — full sweep (validate + discover)
const FAST_BUDGET_MS  =  55_000; // 55 sec  — validate-only cycle

const VALID_ARCHETYPES = ['Advisor', 'Analyst', 'Executor', 'Catalyst', 'Expert', 'Mentor', 'Connector', 'Creator', 'Guardian'];

class BudgetTimer {
  private startedAt = Date.now();
  constructor(private readonly budgetMs: number) {}
  remaining   = ()  => this.budgetMs - (Date.now() - this.startedAt);
  hasTime     = (minNeeded = 20_000) => this.remaining() > minNeeded;
  elapsedSec  = ()  => ((Date.now() - this.startedAt) / 1000).toFixed(1);
}

// ── Scope classifier (Vael classifies her own discoveries) ───────────────────

const SCOPE_PROMPT = `Classify this knowledge entry for the collective DNA corpus.

Return JSON only:
{
  "dna_scope": "general" | "specialty",
  "archetype_scope": ["Analyst"],
  "domain_tags": ["agriculture"]
}

Rules:
- "general": knowledge about how to think, operate, or communicate — target archetypes from [${VALID_ARCHETYPES.join(', ')}], empty [] if universal
- "specialty": domain-specific — set domain_tags (e.g. agriculture, finance, legal, medical, engineering, hr, sales, marketing, education, technology)`;

async function classifyScope(content: string): Promise<{
  dnaScope: 'general' | 'specialty';
  archetypeScope: string[];
  domainTags: string[];
}> {
  try {
    const res = await chatCompletion(
      [
        { role: 'system', content: SCOPE_PROMPT },
        { role: 'user', content: content.slice(0, 600) },
      ],
      { model: KB_MODEL },
    );
    const parsed = JSON.parse(res.content.trim());
    return {
      dnaScope: parsed.dna_scope === 'specialty' ? 'specialty' : 'general',
      archetypeScope: Array.isArray(parsed.archetype_scope)
        ? parsed.archetype_scope.filter((a: string) => VALID_ARCHETYPES.includes(a))
        : [],
      domainTags: Array.isArray(parsed.domain_tags) ? parsed.domain_tags : [],
    };
  } catch {
    return { dnaScope: 'general', archetypeScope: [], domainTags: [] };
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
    layer: 'collective',
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

  const [scope, embedding] = await Promise.all([
    classifyScope(finalContent),
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
    layer: 'collective',
    title: proposal.title,
    content: finalContent,
    embedding: embedding ?? null,
    tags: proposal.suggested_tags ?? [],
    sourceName: proposal.suggested_source_name ?? 'Vael Discovery',
    sourceHash: hash,
    confidence: validation.confidence_suggested ?? proposal.suggested_confidence,
    knowledgeStatus: 'current',
    dnaScope: scope.dnaScope,
    archetypeScope: scope.archetypeScope,
    domainTags: scope.domainTags,
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

// ── Full sweep ────────────────────────────────────────────────────────────────

export async function runVaelFullSweep(): Promise<void> {
  const timer = new BudgetTimer(FULL_BUDGET_MS);
  console.log('[VAEL] Full sweep starting:', new Date().toISOString());

  const validation = await runValidationPhase(timer);

  let discovery = { proposed: 0, seeded: 0, flagged: 0 };
  if (timer.hasTime(60_000)) {
    discovery = await runDiscoveryPhase(timer);
  } else {
    console.log('[VAEL] Budget too low after validation — skipping discovery');
  }

  console.log(
    `[VAEL] Full sweep done in ${timer.elapsedSec()}s — ` +
    `validated=${validation.validated} approved=${validation.approved} revised=${validation.revised} rejected=${validation.rejected} | ` +
    `proposed=${discovery.proposed} seeded=${discovery.seeded} flagged=${discovery.flagged}`,
  );
}

export async function runVaelValidationOnly(): Promise<void> {
  const timer = new BudgetTimer(FAST_BUDGET_MS);
  console.log('[VAEL] Validation-only cycle starting:', new Date().toISOString());
  const validation = await runValidationPhase(timer);
  console.log(
    `[VAEL] Validation done in ${timer.elapsedSec()}s — ` +
    `validated=${validation.validated} approved=${validation.approved} revised=${validation.revised} rejected=${validation.rejected}`,
  );
}

// ── Cron registration ─────────────────────────────────────────────────────────

export function startVaelCron(): void {
  // Full sweep twice daily — validate + discover + seed
  const SWEEP_SCHEDULE    = process.env.VAEL_SWEEP_SCHEDULE    ?? '0 1,13 * * *';
  // Validation-only every 6 hours — keep drafts clean between sweeps
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
