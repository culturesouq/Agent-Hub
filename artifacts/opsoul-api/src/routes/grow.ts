import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db';
import {
  operatorsTable,
  growProposalsTable,
  selfAwarenessStateTable,
  conversationsTable,
  messagesTable,
} from '@workspace/db';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';
import { runGrowCycle } from '../utils/growEngine.js';
import {
  buildSelfAwarenessState,
  recomputeSelfAwareness,
} from '../utils/selfAwarenessEngine.js';
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import type { OperatorIdentity } from '../utils/systemPrompt.js';
import { chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import type { Layer2Soul } from '../validation/operator.js';

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

  recomputeSelfAwareness(operatorId, 'grow_approved').catch(() => {});
});

router.get('/self-awareness', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [stored] = await db
    .select()
    .from(selfAwarenessStateTable)
    .where(eq(selfAwarenessStateTable.operatorId, operatorId));

  if (stored) {
    res.json(stored);
    return;
  }

  try {
    const live = await buildSelfAwarenessState(operatorId);
    res.json({ ...live, note: 'Live-computed — no cached state yet. POST /self-awareness/recompute to persist.' });
  } catch (err) {
    res.status(502).json({ error: 'Failed to compute self-awareness state', detail: (err as Error).message });
  }
});

router.post('/self-awareness/recompute', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  try {
    await recomputeSelfAwareness(operatorId, 'force');
    const [updated] = await db
      .select()
      .from(selfAwarenessStateTable)
      .where(eq(selfAwarenessStateTable.operatorId, operatorId));
    res.json({ ok: true, state: updated });
  } catch (err) {
    res.status(502).json({ error: 'Recompute failed', detail: (err as Error).message });
  }
});

// T5 — GROW Test Mode: preview before/after with 3 real conversation messages
router.post('/test-proposal/:proposalId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [proposal] = await db
    .select()
    .from(growProposalsTable)
    .where(and(eq(growProposalsTable.id, req.params.proposalId), eq(growProposalsTable.operatorId, operatorId)));
  if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return; }

  const [operator] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, operatorId));
  if (!operator) { res.status(404).json({ error: 'Operator not found' }); return; }

  // Get recent user messages across conversations — pick 3 with temporal spread
  const convIds = (await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.operatorId, operatorId))
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(5)).map(c => c.id);

  let testPrompts: string[] = [];
  if (convIds.length > 0) {
    const recentUserMsgs = await db
      .select({ content: messagesTable.content, createdAt: messagesTable.createdAt })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.operatorId, operatorId),
        eq(messagesTable.role, 'user'),
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(9);
    // pick 3 with temporal spread: latest, middle, oldest of these 9
    const msgs = recentUserMsgs.map(m => m.content);
    if (msgs.length >= 3) {
      testPrompts = [msgs[0], msgs[Math.floor(msgs.length / 2)], msgs[msgs.length - 1]];
    } else {
      testPrompts = msgs;
    }
  }

  if (testPrompts.length === 0) {
    res.json({ testPrompts: [], results: [], message: 'No conversation history yet to test against.' });
    return;
  }

  const currentSoul = operator.layer2Soul as Layer2Soul;
  const proposedChanges = (proposal.proposedChanges ?? {}) as Partial<Layer2Soul>;
  const proposedSoul: Layer2Soul = { ...currentSoul, ...proposedChanges };

  const opIdentity: OperatorIdentity = {
    name: operator.name,
    archetype: operator.archetype,
    mandate: operator.mandate,
    coreValues: operator.coreValues,
    ethicalBoundaries: operator.ethicalBoundaries,
    layer2Soul: currentSoul,
  };

  const currentSystemPrompt = buildSystemPrompt(opIdentity);
  const proposedSystemPrompt = buildSystemPrompt({ ...opIdentity, layer2Soul: proposedSoul });

  try {
    const results = await Promise.all(
      testPrompts.map(async (prompt) => {
        const [currentRes, proposedRes] = await Promise.all([
          chatCompletion([{ role: 'system', content: currentSystemPrompt }, { role: 'user', content: prompt }], CHAT_MODEL),
          chatCompletion([{ role: 'system', content: proposedSystemPrompt }, { role: 'user', content: prompt }], CHAT_MODEL),
        ]);
        return {
          message: prompt,
          current: currentRes.content,
          proposed: proposedRes.content,
        };
      }),
    );

    res.json({ testPrompts, results, proposalId: proposal.id });
  } catch (err) {
    res.status(502).json({ error: 'Test generation failed', detail: (err as Error).message });
  }
});

export default router;
