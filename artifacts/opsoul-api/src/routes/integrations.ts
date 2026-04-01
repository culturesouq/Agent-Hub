import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import { operatorIntegrationsTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and } from 'drizzle-orm';
import { encryptToken, decryptToken } from '@workspace/opsoul-utils/crypto';

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
  scopeUpdatePending: z.boolean().optional(),
  scopeUpdateSummary: z.string().max(500).optional(),
});

function safeSerialize(integration: typeof operatorIntegrationsTable.$inferSelect) {
  const { tokenEncrypted: _, ...safe } = integration;
  return { ...safe, hasToken: !!_ };
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateIntegrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const tokenEncrypted = parsed.data.token
    ? encryptToken(parsed.data.token)
    : null;

  const [integration] = await db.insert(operatorIntegrationsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId: req.owner!.ownerId,
    integrationType: parsed.data.integrationType,
    integrationLabel: parsed.data.integrationLabel,
    tokenEncrypted,
    scopes: parsed.data.scopes ?? [],
    status: 'connected',
    scopeUpdatePending: false,
    contextsAssigned: parsed.data.contextsAssigned ?? [],
  }).returning();

  res.status(201).json(safeSerialize(integration));
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const integrations = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.operatorId, operatorId),
        eq(operatorIntegrationsTable.ownerId, req.owner!.ownerId),
      ),
    );

  res.json({
    operatorId,
    count: integrations.length,
    integrations: integrations.map(safeSerialize),
  });
});

router.get('/:integrationId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [integration] = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.id, req.params.integrationId),
        eq(operatorIntegrationsTable.operatorId, operatorId),
      ),
    );

  if (!integration) { res.status(404).json({ error: 'Integration not found' }); return; }
  res.json(safeSerialize(integration));
});

router.patch('/:integrationId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = UpdateIntegrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [existing] = await db
    .select({ id: operatorIntegrationsTable.id })
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.id, req.params.integrationId),
        eq(operatorIntegrationsTable.operatorId, operatorId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Integration not found' }); return; }

  const { token, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (token) updates.tokenEncrypted = encryptToken(token);

  const [updated] = await db
    .update(operatorIntegrationsTable)
    .set(updates)
    .where(eq(operatorIntegrationsTable.id, req.params.integrationId))
    .returning();

  res.json(safeSerialize(updated));
});

router.delete('/:integrationId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select({ id: operatorIntegrationsTable.id })
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.id, req.params.integrationId),
        eq(operatorIntegrationsTable.operatorId, operatorId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Integration not found' }); return; }

  await db.delete(operatorIntegrationsTable)
    .where(eq(operatorIntegrationsTable.id, req.params.integrationId));

  res.json({ ok: true, deleted: req.params.integrationId });
});

export { decryptToken };
export default router;
