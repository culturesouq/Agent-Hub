import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db';
import { capabilityRequestsTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and, desc } from 'drizzle-orm';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, String(req.params.operatorId)),
        eq(operatorsTable.ownerId, String(req.owner!.ownerId)),
      ),
    );
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op.id;
}

const CreateCapabilityRequestSchema = z.object({
  requestedCapability: z.string().min(1).max(200),
  reason: z.string().min(1).max(2000),
});

const RespondCapabilityRequestSchema = z.object({
  ownerResponse: z.string().min(1).max(2000),
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const rows = await db
    .select()
    .from(capabilityRequestsTable)
    .where(eq(capabilityRequestsTable.operatorId, operatorId))
    .orderBy(desc(capabilityRequestsTable.createdAt));

  res.json({ operatorId, count: rows.length, requests: rows });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateCapabilityRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { requestedCapability, reason } = parsed.data;

  const [created] = await db
    .insert(capabilityRequestsTable)
    .values({
      id: crypto.randomUUID(),
      operatorId,
      requestedCapability,
      reason,
    })
    .returning();

  triggerSelfAwareness(operatorId, 'capability_request');

  res.status(201).json(created);
});

router.get('/:requestId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [row] = await db
    .select()
    .from(capabilityRequestsTable)
    .where(
      and(
        eq(capabilityRequestsTable.id, String(req.params.requestId)),
        eq(capabilityRequestsTable.operatorId, operatorId),
      ),
    );

  if (!row) {
    res.status(404).json({ error: 'Capability request not found' });
    return;
  }

  res.json(row);
});

router.patch('/:requestId/respond', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = RespondCapabilityRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const [existing] = await db
    .select({ id: capabilityRequestsTable.id })
    .from(capabilityRequestsTable)
    .where(
      and(
        eq(capabilityRequestsTable.id, String(req.params.requestId)),
        eq(capabilityRequestsTable.operatorId, operatorId),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: 'Capability request not found' });
    return;
  }

  const [updated] = await db
    .update(capabilityRequestsTable)
    .set({ ownerResponse: parsed.data.ownerResponse })
    .where(eq(capabilityRequestsTable.id, String(req.params.requestId)))
    .returning();

  res.json(updated);
});

router.delete('/:requestId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select({ id: capabilityRequestsTable.id })
    .from(capabilityRequestsTable)
    .where(
      and(
        eq(capabilityRequestsTable.id, String(req.params.requestId)),
        eq(capabilityRequestsTable.operatorId, operatorId),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: 'Capability request not found' });
    return;
  }

  await db
    .delete(capabilityRequestsTable)
    .where(eq(capabilityRequestsTable.id, String(req.params.requestId)));

  res.json({ ok: true });
});

export default router;
