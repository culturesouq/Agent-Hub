import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db';
import {
  operatorsTable,
  growProposalsTable,
  selfAwarenessStateTable,
} from '@workspace/db';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';
import { runGrowCycle } from '../utils/growEngine.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id, growLockLevel: operatorsTable.growLockLevel })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op.id;
}

router.post('/trigger', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  try {
    const result = await runGrowCycle(operatorId);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'GROW cycle failed', detail: (err as Error).message });
  }
});

router.get('/proposals', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const limitRaw = parseInt(req.query.limit as string ?? '20', 10);
  const limit = isNaN(limitRaw) || limitRaw < 1 ? 20 : Math.min(limitRaw, 100);

  const proposals = await db
    .select()
    .from(growProposalsTable)
    .where(eq(growProposalsTable.operatorId, operatorId))
    .orderBy(desc(growProposalsTable.createdAt))
    .limit(limit);

  res.json({ operatorId, count: proposals.length, proposals });
});

router.get('/proposals/:proposalId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [proposal] = await db
    .select()
    .from(growProposalsTable)
    .where(
      and(
        eq(growProposalsTable.id, req.params.proposalId),
        eq(growProposalsTable.operatorId, operatorId),
      ),
    );

  if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return; }
  res.json(proposal);
});

const DecideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
});

router.patch('/proposals/:proposalId/decide', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = DecideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [proposal] = await db
    .select()
    .from(growProposalsTable)
    .where(
      and(
        eq(growProposalsTable.id, req.params.proposalId),
        eq(growProposalsTable.operatorId, operatorId),
      ),
    );

  if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return; }
  if (proposal.status !== 'needs_owner_review') {
    res.status(409).json({ error: `Proposal is in '${proposal.status}' state, only 'needs_owner_review' proposals can be decided` });
    return;
  }

  const { decision, reason } = parsed.data;

  if (decision === 'approve') {
    const [operator] = await db
      .select()
      .from(operatorsTable)
      .where(eq(operatorsTable.id, operatorId));

    if (operator.growLockLevel === 'FROZEN') {
      res.status(423).json({ error: 'Soul is FROZEN — cannot apply GROW changes' });
      return;
    }

    const evaluation = proposal.claudeEvaluation as {
      approved?: string[];
      needsOwnerReview?: string[];
    } | null;

    const proposedChanges = proposal.proposedChanges as Record<string, unknown>;
    const fieldsToApply = [
      ...(evaluation?.approved ?? []),
      ...(evaluation?.needsOwnerReview ?? []),
    ];

    if (fieldsToApply.length > 0 && proposedChanges) {
      const currentSoul = operator.layer2Soul as Record<string, unknown>;
      const updatedSoul = { ...currentSoul };
      for (const field of fieldsToApply) {
        if (proposedChanges[field] !== undefined) {
          updatedSoul[field] = proposedChanges[field];
        }
      }
      await db.update(operatorsTable)
        .set({ layer2Soul: updatedSoul })
        .where(eq(operatorsTable.id, operatorId));
    }
  }

  const [updated] = await db.update(growProposalsTable)
    .set({
      status: decision === 'approve' ? 'applied' : 'rejected',
      ownerDecision: `${decision}${reason ? `: ${reason}` : ''}`,
      decidedAt: new Date(),
    })
    .where(eq(growProposalsTable.id, proposal.id))
    .returning();

  res.json({ ok: true, proposalId: proposal.id, status: updated.status });
});

router.get('/self-awareness', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [state] = await db
    .select()
    .from(selfAwarenessStateTable)
    .where(eq(selfAwarenessStateTable.operatorId, operatorId));

  if (!state) {
    res.json({ operatorId, state: null, message: 'No self-awareness state yet — will be created after first GROW cycle' });
    return;
  }

  res.json(state);
});

const UpdateSelfAwarenessSchema = z.object({
  identityState: z.record(z.unknown()).optional(),
  soulState: z.record(z.unknown()).optional(),
  capabilityState: z.record(z.unknown()).optional(),
  taskHistory: z.record(z.unknown()).optional(),
  mandateGaps: z.array(z.string()).optional(),
  lastUpdateTrigger: z.string().max(100).optional(),
});

router.put('/self-awareness', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = UpdateSelfAwarenessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [existing] = await db
    .select({ id: selfAwarenessStateTable.id })
    .from(selfAwarenessStateTable)
    .where(eq(selfAwarenessStateTable.operatorId, operatorId));

  const payload = {
    ...parsed.data,
    lastUpdated: new Date(),
    lastUpdateTrigger: parsed.data.lastUpdateTrigger ?? 'owner_manual',
  };

  if (existing) {
    const [updated] = await db.update(selfAwarenessStateTable)
      .set(payload)
      .where(eq(selfAwarenessStateTable.operatorId, operatorId))
      .returning();
    res.json(updated);
  } else {
    const crypto = await import('crypto');
    const [created] = await db.insert(selfAwarenessStateTable)
      .values({ id: crypto.randomUUID(), operatorId, ...payload })
      .returning();
    res.status(201).json(created);
  }
});

export default router;
