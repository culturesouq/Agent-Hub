import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import {
  missionContextsTable,
  operatorsTable,
  conversationsTable,
  operatorIntegrationsTable,
} from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and, inArray } from 'drizzle-orm';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
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

const CreateContextSchema = z.object({
  name: z.string().min(1).max(100),
  toneInstructions: z.string().max(2000).optional(),
  kbFilter: z.array(z.string().max(200)).max(20).optional(),
  integrationsAllowed: z.array(z.string()).max(20).optional(),
  growLockOverride: z.enum(['OPEN', 'CONTROLLED', 'LOCKED', 'FROZEN']).optional(),
});

const UpdateContextSchema = CreateContextSchema.partial();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateContextSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  if (parsed.data.integrationsAllowed?.length) {
    const integrations = await db
      .select({ id: operatorIntegrationsTable.id })
      .from(operatorIntegrationsTable)
      .where(
        and(
          eq(operatorIntegrationsTable.operatorId, operatorId),
          inArray(operatorIntegrationsTable.id, parsed.data.integrationsAllowed),
        ),
      );
    if (integrations.length !== parsed.data.integrationsAllowed.length) {
      res.status(400).json({ error: 'One or more integration IDs are invalid for this operator' });
      return;
    }
  }

  const [ctx] = await db.insert(missionContextsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    name: parsed.data.name,
    toneInstructions: parsed.data.toneInstructions,
    kbFilter: parsed.data.kbFilter ?? [],
    integrationsAllowed: parsed.data.integrationsAllowed ?? [],
    growLockOverride: parsed.data.growLockOverride,
  }).returning();

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.status(201).json(ctx);
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const contexts = await db
    .select()
    .from(missionContextsTable)
    .where(eq(missionContextsTable.operatorId, operatorId));

  res.json({ operatorId, count: contexts.length, contexts });
});

router.get('/:ctxId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [ctx] = await db
    .select()
    .from(missionContextsTable)
    .where(
      and(
        eq(missionContextsTable.id, req.params.ctxId),
        eq(missionContextsTable.operatorId, operatorId),
      ),
    );

  if (!ctx) { res.status(404).json({ error: 'Mission context not found' }); return; }

  let integrations: { id: string; integrationType: string; integrationLabel: string; status: string | null }[] = [];
  if (ctx.integrationsAllowed && ctx.integrationsAllowed.length > 0) {
    integrations = await db
      .select({
        id: operatorIntegrationsTable.id,
        integrationType: operatorIntegrationsTable.integrationType,
        integrationLabel: operatorIntegrationsTable.integrationLabel,
        status: operatorIntegrationsTable.status,
      })
      .from(operatorIntegrationsTable)
      .where(inArray(operatorIntegrationsTable.id, ctx.integrationsAllowed));
  }

  res.json({ ...ctx, integrations });
});

router.patch('/:ctxId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = UpdateContextSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [existing] = await db
    .select({ id: missionContextsTable.id })
    .from(missionContextsTable)
    .where(
      and(
        eq(missionContextsTable.id, req.params.ctxId),
        eq(missionContextsTable.operatorId, operatorId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Mission context not found' }); return; }

  if (parsed.data.integrationsAllowed?.length) {
    const integrations = await db
      .select({ id: operatorIntegrationsTable.id })
      .from(operatorIntegrationsTable)
      .where(
        and(
          eq(operatorIntegrationsTable.operatorId, operatorId),
          inArray(operatorIntegrationsTable.id, parsed.data.integrationsAllowed),
        ),
      );
    if (integrations.length !== parsed.data.integrationsAllowed.length) {
      res.status(400).json({ error: 'One or more integration IDs are invalid for this operator' });
      return;
    }
  }

  const [updated] = await db
    .update(missionContextsTable)
    .set(parsed.data)
    .where(eq(missionContextsTable.id, req.params.ctxId))
    .returning();

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.json(updated);
});

router.delete('/:ctxId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select({ id: missionContextsTable.id })
    .from(missionContextsTable)
    .where(
      and(
        eq(missionContextsTable.id, req.params.ctxId),
        eq(missionContextsTable.operatorId, operatorId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Mission context not found' }); return; }

  await db.update(conversationsTable)
    .set({ missionContextId: null })
    .where(
      and(
        eq(conversationsTable.operatorId, operatorId),
        eq(conversationsTable.missionContextId, req.params.ctxId),
      ),
    );

  await db.delete(missionContextsTable).where(eq(missionContextsTable.id, req.params.ctxId));
  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.json({ ok: true, deleted: req.params.ctxId });
});

router.post('/:ctxId/activate', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const convId = req.body.conversationId ?? req.query.conversationId;
  if (!convId || typeof convId !== 'string') {
    res.status(400).json({ error: 'conversationId is required (body or query param)' });
    return;
  }

  const [ctx] = await db
    .select({ id: missionContextsTable.id, name: missionContextsTable.name })
    .from(missionContextsTable)
    .where(
      and(
        eq(missionContextsTable.id, req.params.ctxId),
        eq(missionContextsTable.operatorId, operatorId),
      ),
    );

  if (!ctx) { res.status(404).json({ error: 'Mission context not found' }); return; }

  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, convId),
        eq(conversationsTable.operatorId, operatorId),
      ),
    );

  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }

  await db.update(conversationsTable)
    .set({ missionContextId: ctx.id })
    .where(eq(conversationsTable.id, convId));

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.json({ ok: true, conversationId: convId, missionContextId: ctx.id, missionContextName: ctx.name });
});

router.delete('/:ctxId/activate', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const convId = req.body.conversationId ?? req.query.conversationId;
  if (!convId || typeof convId !== 'string') {
    res.status(400).json({ error: 'conversationId is required (body or query param)' });
    return;
  }

  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, convId),
        eq(conversationsTable.operatorId, operatorId),
      ),
    );

  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }

  await db.update(conversationsTable)
    .set({ missionContextId: null })
    .where(eq(conversationsTable.id, convId));

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.json({ ok: true, conversationId: convId, missionContextId: null });
});

export default router;
