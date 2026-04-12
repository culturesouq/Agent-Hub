import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { capabilityRequestsTable, operatorsTable } from '@workspace/db-v2';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';

const router = Router({ mergeParams: true });

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db.select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return null; }
  return op.id;
}

const CreateRequestSchema = z.object({
  requestedCapability: z.string().min(1).max(500),
  reason: z.string().min(1).max(2000),
});

const RespondSchema = z.object({
  response: z.string().min(1).max(2000),
});

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const rows = await db.select().from(capabilityRequestsTable)
    .where(eq(capabilityRequestsTable.operatorId, operatorId))
    .orderBy(desc(capabilityRequestsTable.createdAt));

  res.json({ operatorId, count: rows.length, requests: rows });
});

// ── Get single ────────────────────────────────────────────────────────────────

router.get('/:requestId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [row] = await db.select().from(capabilityRequestsTable)
    .where(and(eq(capabilityRequestsTable.id, req.params.requestId), eq(capabilityRequestsTable.operatorId, operatorId)));
  if (!row) { res.status(404).json({ error: 'Capability request not found' }); return; }
  res.json(row);
});

// ── Create (operator submits a capability request) ────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const [row] = await db.insert(capabilityRequestsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    requestedCapability: parsed.data.requestedCapability,
    reason: parsed.data.reason,
  }).returning();

  triggerSelfAwareness(operatorId, 'conversation_end');
  res.status(201).json(row);
});

// ── Respond (owner approves/rejects with reason) ──────────────────────────────

router.patch('/:requestId/respond', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = RespondSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'response (string) required' }); return; }

  const [existing] = await db.select({ id: capabilityRequestsTable.id })
    .from(capabilityRequestsTable)
    .where(and(eq(capabilityRequestsTable.id, req.params.requestId), eq(capabilityRequestsTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Capability request not found' }); return; }

  const [updated] = await db.update(capabilityRequestsTable)
    .set({ ownerResponse: parsed.data.response })
    .where(eq(capabilityRequestsTable.id, existing.id)).returning();

  triggerSelfAwareness(operatorId, 'conversation_end');
  res.json(updated);
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete('/:requestId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db.select({ id: capabilityRequestsTable.id })
    .from(capabilityRequestsTable)
    .where(and(eq(capabilityRequestsTable.id, req.params.requestId), eq(capabilityRequestsTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Capability request not found' }); return; }

  await db.delete(capabilityRequestsTable).where(eq(capabilityRequestsTable.id, existing.id));
  res.json({ ok: true });
});

export default router;
