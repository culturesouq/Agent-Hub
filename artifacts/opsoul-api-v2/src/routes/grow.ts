import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { growProposalsTable, selfAwarenessStateTable, operatorsTable, messagesTable } from '@workspace/db-v2';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { recomputeSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { runGrowCron } from '../cron/growCron.js';

const router = Router({ mergeParams: true });

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db.select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return null; }
  return op.id;
}

// ── Trigger GROW cycle ────────────────────────────────────────────────────────

router.post('/trigger', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await resolveOperator(req, res)) return;
  try {
    // Run the full cron cycle; proposals generated for this operator will appear in /proposals
    void runGrowCron();
    res.json({ ok: true, message: 'GROW cycle triggered — proposals will be ready shortly.' });
  } catch (err) {
    res.status(502).json({ error: 'GROW trigger failed', detail: (err as Error).message });
  }
});

// ── List proposals ────────────────────────────────────────────────────────────

router.get('/proposals', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
  const rows = await db.select().from(growProposalsTable)
    .where(eq(growProposalsTable.operatorId, operatorId))
    .orderBy(desc(growProposalsTable.createdAt))
    .limit(limit);

  res.json({ operatorId, count: rows.length, proposals: rows });
});

// ── Get single proposal ───────────────────────────────────────────────────────

router.get('/proposals/:proposalId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [proposal] = await db.select().from(growProposalsTable)
    .where(and(eq(growProposalsTable.id, req.params.proposalId), eq(growProposalsTable.operatorId, operatorId)));
  if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return; }
  res.json(proposal);
});

// ── Decide on proposal ────────────────────────────────────────────────────────

const DecideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
});

router.post('/proposals/:proposalId/decide', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = DecideSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'decision must be approve or reject' }); return; }

  const [existing] = await db.select({ id: growProposalsTable.id }).from(growProposalsTable)
    .where(and(eq(growProposalsTable.id, req.params.proposalId), eq(growProposalsTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Proposal not found' }); return; }

  await db.update(growProposalsTable).set({
    ownerDecision: parsed.data.decision,
    status: parsed.data.decision === 'approve' ? 'approved' : 'rejected',
    decidedAt: new Date(),
  }).where(eq(growProposalsTable.id, existing.id));

  res.json({ ok: true });
});

// ── Test proposal ─────────────────────────────────────────────────────────────

router.get('/proposals/:proposalId/test', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [proposal] = await db.select().from(growProposalsTable)
    .where(and(eq(growProposalsTable.id, req.params.proposalId), eq(growProposalsTable.operatorId, operatorId)));
  if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return; }

  const FALLBACKS = ['What can you help me with?', 'Tell me about yourself.', "How do you handle complexity?"];
  const recentMsgs = await db.select({ content: messagesTable.content })
    .from(messagesTable).where(and(eq(messagesTable.operatorId, operatorId), eq(messagesTable.role, 'user')))
    .orderBy(desc(messagesTable.createdAt)).limit(3);

  const testPrompts = recentMsgs.length >= 3
    ? recentMsgs.map(m => m.content)
    : [...recentMsgs.map(m => m.content), ...FALLBACKS.slice(recentMsgs.length)];

  res.json({ proposalId: proposal.id, proposal, testPrompts, note: 'Use POST /decide to approve or reject.' });
});

// ── Self-awareness ────────────────────────────────────────────────────────────

router.get('/self-awareness', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [state] = await db.select().from(selfAwarenessStateTable)
    .where(eq(selfAwarenessStateTable.operatorId, operatorId));
  res.json(state ?? null);
});

router.post('/self-awareness/recompute', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  await recomputeSelfAwareness(operatorId, 'force');
  const [state] = await db.select().from(selfAwarenessStateTable).where(eq(selfAwarenessStateTable.operatorId, operatorId));
  res.json({ ok: true, state: state ?? null });
});

export default router;
