import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { operatorIntegrationsTable, operatorsTable } from '@workspace/db-v2';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { encryptToken, decryptToken } from '@workspace/opsoul-utils/crypto';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';

const router = Router({ mergeParams: true });

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db.select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return null; }
  return op.id;
}

function safeSerialize(row: typeof operatorIntegrationsTable.$inferSelect) {
  const { tokenEncrypted: _t, refreshTokenEncrypted: _r, ...safe } = row;
  return { ...safe, hasToken: !!_t };
}

const CreateIntegrationSchema = z.object({
  integrationType: z.string().min(1).max(100),
  integrationLabel: z.string().min(1).max(200),
  token: z.string().min(1).max(4000).optional(),
  scopes: z.array(z.string().max(100)).max(50).optional(),
  contextsAssigned: z.array(z.string()).max(20).optional(),
});

const UpdateIntegrationSchema = z.object({
  integrationLabel: z.string().min(1).max(200).optional(),
  token: z.string().min(1).max(4000).optional(),
  scopes: z.array(z.string().max(100)).max(50).optional(),
  status: z.enum(['connected', 'disconnected', 'error']).optional(),
  contextsAssigned: z.array(z.string()).max(20).optional(),
});

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const rows = await db.select().from(operatorIntegrationsTable)
    .where(and(eq(operatorIntegrationsTable.operatorId, operatorId), eq(operatorIntegrationsTable.ownerId, req.owner!.ownerId)));
  res.json({ operatorId, count: rows.length, integrations: rows.map(safeSerialize) });
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateIntegrationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const [row] = await db.insert(operatorIntegrationsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId: req.owner!.ownerId,
    integrationType: parsed.data.integrationType,
    integrationLabel: parsed.data.integrationLabel,
    tokenEncrypted: parsed.data.token ? encryptToken(parsed.data.token) : null,
    scopes: parsed.data.scopes ?? [],
    status: 'connected',
    scopeUpdatePending: false,
    contextsAssigned: parsed.data.contextsAssigned ?? [],
  }).returning();

  res.status(201).json(safeSerialize(row));
  triggerSelfAwareness(operatorId, 'integration_change');
});

// ── Update ────────────────────────────────────────────────────────────────────

router.patch('/:integrationId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = UpdateIntegrationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const [existing] = await db.select({ id: operatorIntegrationsTable.id })
    .from(operatorIntegrationsTable)
    .where(and(eq(operatorIntegrationsTable.id, req.params.integrationId), eq(operatorIntegrationsTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Integration not found' }); return; }

  const { token, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (token) updates.tokenEncrypted = encryptToken(token);

  const [updated] = await db.update(operatorIntegrationsTable).set(updates)
    .where(eq(operatorIntegrationsTable.id, existing.id)).returning();

  res.json(safeSerialize(updated));
  triggerSelfAwareness(operatorId, 'integration_change');
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete('/:integrationId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db.select({ id: operatorIntegrationsTable.id })
    .from(operatorIntegrationsTable)
    .where(and(eq(operatorIntegrationsTable.id, req.params.integrationId), eq(operatorIntegrationsTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Integration not found' }); return; }

  await db.delete(operatorIntegrationsTable).where(eq(operatorIntegrationsTable.id, existing.id));
  res.json({ ok: true, deleted: existing.id });
  triggerSelfAwareness(operatorId, 'integration_change');
});

export { decryptToken };
export default router;
