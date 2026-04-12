import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { operatorDeploymentSlotsTable, operatorsTable } from '@workspace/db-v2';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

const SURFACE_TYPES = ['workspace', 'crud', 'guest', 'authenticated'] as const;

function surfaceToTrust(surfaceType: string): string {
  const map: Record<string, string> = { workspace: 'owner', crud: 'owner', authenticated: 'authenticated', guest: 'guest' };
  return map[surfaceType] ?? 'guest';
}

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db.select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return null; }
  return op.id;
}

const SLOT_SAFE_FIELDS = {
  id: operatorDeploymentSlotsTable.id,
  operatorId: operatorDeploymentSlotsTable.operatorId,
  name: operatorDeploymentSlotsTable.name,
  surfaceType: operatorDeploymentSlotsTable.surfaceType,
  scopeTrust: operatorDeploymentSlotsTable.scopeTrust,
  apiKeyPreview: operatorDeploymentSlotsTable.apiKeyPreview,
  isActive: operatorDeploymentSlotsTable.isActive,
  allowedOrigins: operatorDeploymentSlotsTable.allowedOrigins,
  createdAt: operatorDeploymentSlotsTable.createdAt,
  revokedAt: operatorDeploymentSlotsTable.revokedAt,
};

const CreateSlotSchema = z.object({
  name: z.string().min(1).max(100),
  surfaceType: z.enum(SURFACE_TYPES),
  allowedOrigins: z.array(z.string()).optional(),
});

const PatchSlotSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  allowedOrigins: z.array(z.string()).optional(),
});

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const slots = await db.select(SLOT_SAFE_FIELDS).from(operatorDeploymentSlotsTable)
    .where(eq(operatorDeploymentSlotsTable.operatorId, operatorId));
  res.json(slots);
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateSlotSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const { name, surfaceType, allowedOrigins } = parsed.data;
  const rawKey = `opsk_${crypto.randomBytes(48).toString('hex')}`;
  const hashedKey = hashKey(rawKey);

  const [slot] = await db.insert(operatorDeploymentSlotsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId: req.owner!.ownerId,
    name,
    surfaceType,
    scopeTrust: surfaceToTrust(surfaceType),
    apiKey: hashedKey,
    apiKeyPreview: rawKey.slice(0, 12),
    isActive: true,
    allowedOrigins: allowedOrigins ?? null,
  }).returning(SLOT_SAFE_FIELDS);

  res.status(201).json({ ...slot, apiKey: rawKey });
});

// ── Patch ─────────────────────────────────────────────────────────────────────

router.patch('/:slotId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db.select({ id: operatorDeploymentSlotsTable.id }).from(operatorDeploymentSlotsTable)
    .where(and(eq(operatorDeploymentSlotsTable.id, req.params.slotId), eq(operatorDeploymentSlotsTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Slot not found' }); return; }

  const parsed = PatchSlotSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(operatorDeploymentSlotsTable).set(parsed.data)
    .where(eq(operatorDeploymentSlotsTable.id, existing.id)).returning(SLOT_SAFE_FIELDS);
  res.json(updated);
});

// ── Revoke (soft delete) ──────────────────────────────────────────────────────

router.delete('/:slotId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db.select({ id: operatorDeploymentSlotsTable.id }).from(operatorDeploymentSlotsTable)
    .where(and(eq(operatorDeploymentSlotsTable.id, req.params.slotId), eq(operatorDeploymentSlotsTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Slot not found' }); return; }

  await db.update(operatorDeploymentSlotsTable).set({ isActive: false, revokedAt: new Date() })
    .where(eq(operatorDeploymentSlotsTable.id, existing.id));
  res.json({ ok: true, revoked: existing.id });
});

export default router;
