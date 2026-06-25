import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import { operatorSecretsTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and } from 'drizzle-orm';
import { encryptToken, decryptToken } from '@workspace/opsoul-utils/crypto';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId as string),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op.id;
}

const CreateSecretSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Z0-9_]+$/, 'Key must be uppercase letters, numbers, and underscores only'),
  value: z.string().min(1).max(8000),
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const secrets = await db
    .select({
      id: operatorSecretsTable.id,
      key: operatorSecretsTable.key,
      createdAt: operatorSecretsTable.createdAt,
    })
    .from(operatorSecretsTable)
    .where(
      and(
        eq(operatorSecretsTable.operatorId, operatorId),
        eq(operatorSecretsTable.ownerId, req.owner!.ownerId),
      ),
    );

  res.json({ secrets });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateSecretSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { key, value } = parsed.data;

  const [existing] = await db
    .select({ id: operatorSecretsTable.id })
    .from(operatorSecretsTable)
    .where(
      and(
        eq(operatorSecretsTable.operatorId, operatorId),
        eq(operatorSecretsTable.ownerId, req.owner!.ownerId),
        eq(operatorSecretsTable.key, key),
      ),
    );

  if (existing) {
    const [updated] = await db
      .update(operatorSecretsTable)
      .set({ valueEncrypted: encryptToken(value) })
      .where(eq(operatorSecretsTable.id, existing.id))
      .returning({ id: operatorSecretsTable.id, key: operatorSecretsTable.key, createdAt: operatorSecretsTable.createdAt });
    triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
    res.status(200).json(updated);
    return;
  }

  const [created] = await db
    .insert(operatorSecretsTable)
    .values({
      id: crypto.randomUUID(),
      operatorId,
      ownerId: req.owner!.ownerId,
      key,
      valueEncrypted: encryptToken(value),
    })
    .returning({ id: operatorSecretsTable.id, key: operatorSecretsTable.key, createdAt: operatorSecretsTable.createdAt });

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.status(201).json(created);
});

router.get('/:secretId/reveal', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [secret] = await db
    .select()
    .from(operatorSecretsTable)
    .where(
      and(
        eq(operatorSecretsTable.id, req.params.secretId as string),
        eq(operatorSecretsTable.operatorId, operatorId),
        eq(operatorSecretsTable.ownerId, req.owner!.ownerId),
      ),
    );

  if (!secret) { res.status(404).json({ error: 'Secret not found' }); return; }

  res.json({ id: secret.id, key: secret.key, value: decryptToken(secret.valueEncrypted) });
});

router.patch('/:secretId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const { value } = req.body as { value?: string };
  if (!value || typeof value !== 'string' || value.trim() === '') {
    res.status(400).json({ error: 'value (non-empty string) is required' });
    return;
  }

  const [existing] = await db
    .select({ id: operatorSecretsTable.id })
    .from(operatorSecretsTable)
    .where(
      and(
        eq(operatorSecretsTable.id, req.params.secretId as string),
        eq(operatorSecretsTable.operatorId, operatorId),
        eq(operatorSecretsTable.ownerId, req.owner!.ownerId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Secret not found' }); return; }

  const [updated] = await db
    .update(operatorSecretsTable)
    .set({ valueEncrypted: encryptToken(value) })
    .where(eq(operatorSecretsTable.id, existing.id))
    .returning({ id: operatorSecretsTable.id, key: operatorSecretsTable.key, createdAt: operatorSecretsTable.createdAt });

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.json(updated);
});

router.delete('/:secretId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select({ id: operatorSecretsTable.id })
    .from(operatorSecretsTable)
    .where(
      and(
        eq(operatorSecretsTable.id, req.params.secretId as string),
        eq(operatorSecretsTable.operatorId, operatorId),
        eq(operatorSecretsTable.ownerId, req.owner!.ownerId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Secret not found' }); return; }

  await db
    .delete(operatorSecretsTable)
    .where(eq(operatorSecretsTable.id, req.params.secretId as string));

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.json({ ok: true, deleted: req.params.secretId as string });
});

export default router;
