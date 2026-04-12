import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { operatorSecretsTable, operatorsTable } from '@workspace/db-v2';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { encryptToken, decryptToken } from '@workspace/opsoul-utils/crypto';

const router = Router({ mergeParams: true });

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db.select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return null; }
  return op.id;
}

function safeRow(row: typeof operatorSecretsTable.$inferSelect) {
  const { valueEncrypted: _v, ...safe } = row;
  return { ...safe, hasValue: true };
}

const CreateSecretSchema = z.object({
  key: z.string().min(1).max(200).regex(/^[A-Z0-9_]+$/, 'key must be uppercase letters, numbers, underscores'),
  value: z.string().min(1).max(8000),
});

const UpdateSecretSchema = z.object({
  value: z.string().min(1).max(8000),
});

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const rows = await db.select().from(operatorSecretsTable)
    .where(and(eq(operatorSecretsTable.operatorId, operatorId), eq(operatorSecretsTable.ownerId, req.owner!.ownerId)));
  res.json({ operatorId, count: rows.length, secrets: rows.map(safeRow) });
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateSecretSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const { key, value } = parsed.data;

  const [existing] = await db.select({ id: operatorSecretsTable.id }).from(operatorSecretsTable)
    .where(and(eq(operatorSecretsTable.operatorId, operatorId), eq(operatorSecretsTable.key, key)));
  if (existing) { res.status(409).json({ error: `Secret with key "${key}" already exists. PATCH to update.` }); return; }

  const [row] = await db.insert(operatorSecretsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId: req.owner!.ownerId,
    key,
    valueEncrypted: encryptToken(value),
  }).returning();

  res.status(201).json(safeRow(row));
});

// ── Reveal value (owner only) ─────────────────────────────────────────────────

router.get('/:secretId/reveal', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [row] = await db.select().from(operatorSecretsTable)
    .where(and(eq(operatorSecretsTable.id, req.params.secretId), eq(operatorSecretsTable.operatorId, operatorId)));
  if (!row) { res.status(404).json({ error: 'Secret not found' }); return; }

  const value = decryptToken(row.valueEncrypted);
  res.json({ id: row.id, key: row.key, value });
});

// ── Update value ──────────────────────────────────────────────────────────────

router.patch('/:secretId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = UpdateSecretSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'value (string) required' }); return; }

  const [existing] = await db.select({ id: operatorSecretsTable.id }).from(operatorSecretsTable)
    .where(and(eq(operatorSecretsTable.id, req.params.secretId), eq(operatorSecretsTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Secret not found' }); return; }

  const [updated] = await db.update(operatorSecretsTable)
    .set({ valueEncrypted: encryptToken(parsed.data.value) })
    .where(eq(operatorSecretsTable.id, existing.id)).returning();

  res.json(safeRow(updated));
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete('/:secretId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db.select({ id: operatorSecretsTable.id }).from(operatorSecretsTable)
    .where(and(eq(operatorSecretsTable.id, req.params.secretId), eq(operatorSecretsTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Secret not found' }); return; }

  await db.delete(operatorSecretsTable).where(eq(operatorSecretsTable.id, existing.id));
  res.json({ ok: true, deleted: existing.id });
});

export default router;
