import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db-v2';
import { growProposalsTable, selfAwarenessStateTable } from '@workspace/db-v2';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.get('/proposals', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const proposals = await db.select().from(growProposalsTable)
    .where(eq(growProposalsTable.operatorId, operatorId))
    .orderBy(desc(growProposalsTable.createdAt));
  res.json(proposals);
});

router.post('/proposals/:proposalId/decide', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, proposalId } = req.params as { operatorId: string; proposalId: string };
  const { decision } = req.body as { decision?: 'approve' | 'reject' };
  if (!decision || !['approve', 'reject'].includes(decision)) {
    res.status(400).json({ error: 'decision must be approve or reject' }); return;
  }

  await db.update(growProposalsTable)
    .set({
      ownerDecision: decision,
      status: decision === 'approve' ? 'approved' : 'rejected',
      decidedAt: new Date(),
    })
    .where(and(eq(growProposalsTable.id, proposalId), eq(growProposalsTable.operatorId, operatorId)));

  res.json({ ok: true });
});

router.get('/self-awareness', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const [state] = await db.select().from(selfAwarenessStateTable)
    .where(eq(selfAwarenessStateTable.operatorId, operatorId));
  res.json(state ?? null);
});

export default router;
