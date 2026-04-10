import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import { operatorDeploymentSlotsTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and } from 'drizzle-orm';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const CreateSlotSchema = z.object({
  name: z.string().min(1).max(100),
  surfaceType: z.enum(['workspace', 'crud', 'guest', 'authenticated']),
  allowedOrigins: z.array(z.string().url()).optional(),
});

const PatchSlotSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
});

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function surfaceToTrust(surfaceType: string): string {
  switch (surfaceType) {
    case 'workspace': return 'owner';
    case 'crud':      return 'owner';
    case 'authenticated': return 'authenticated';
    case 'guest':     return 'guest';
    default:          return 'guest';
  }
}

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

// POST /operators/:operatorId/slots — create
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateSlotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, surfaceType, allowedOrigins } = parsed.data;

  // Generate key: opsk_ + 48 hex bytes = opsk_ + 96 chars
  const rawKey = `opsk_${crypto.randomBytes(48).toString('hex')}`;
  const hashedKey = hashKey(rawKey);
  const preview = rawKey.slice(0, 12);

  const [slot] = await db.insert(operatorDeploymentSlotsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId: req.owner!.ownerId,
    name,
    surfaceType,
    scopeTrust: surfaceToTrust(surfaceType),
    apiKey: hashedKey,
    apiKeyPreview: preview,
    isActive: true,
    allowedOrigins: allowedOrigins ?? null,
  }).returning({
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
  });

  // Return the raw key ONCE — never again
  res.status(201).json({ ...slot, apiKey: rawKey });
});

// GET /operators/:operatorId/slots — list
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const slots = await db
    .select({
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
    })
    .from(operatorDeploymentSlotsTable)
    .where(eq(operatorDeploymentSlotsTable.operatorId, operatorId));

  res.json({ slots });
});

// PATCH /operators/:operatorId/slots/:slotId — update
router.patch('/:slotId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = PatchSlotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [existing] = await db
    .select({ id: operatorDeploymentSlotsTable.id })
    .from(operatorDeploymentSlotsTable)
    .where(
      and(
        eq(operatorDeploymentSlotsTable.id, req.params.slotId),
        eq(operatorDeploymentSlotsTable.operatorId, operatorId),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: 'Slot not found' });
    return;
  }

  const updates: Partial<typeof operatorDeploymentSlotsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined)          updates.name = parsed.data.name;
  if (parsed.data.isActive !== undefined)       updates.isActive = parsed.data.isActive;
  if (parsed.data.allowedOrigins !== undefined) updates.allowedOrigins = parsed.data.allowedOrigins;

  const [updated] = await db
    .update(operatorDeploymentSlotsTable)
    .set(updates)
    .where(eq(operatorDeploymentSlotsTable.id, req.params.slotId))
    .returning({
      id: operatorDeploymentSlotsTable.id,
      name: operatorDeploymentSlotsTable.name,
      surfaceType: operatorDeploymentSlotsTable.surfaceType,
      scopeTrust: operatorDeploymentSlotsTable.scopeTrust,
      apiKeyPreview: operatorDeploymentSlotsTable.apiKeyPreview,
      isActive: operatorDeploymentSlotsTable.isActive,
      allowedOrigins: operatorDeploymentSlotsTable.allowedOrigins,
      createdAt: operatorDeploymentSlotsTable.createdAt,
      revokedAt: operatorDeploymentSlotsTable.revokedAt,
    });

  res.json(updated);
});

// DELETE /operators/:operatorId/slots/:slotId — revoke
router.delete('/:slotId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select({ id: operatorDeploymentSlotsTable.id })
    .from(operatorDeploymentSlotsTable)
    .where(
      and(
        eq(operatorDeploymentSlotsTable.id, req.params.slotId),
        eq(operatorDeploymentSlotsTable.operatorId, operatorId),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: 'Slot not found' });
    return;
  }

  await db
    .update(operatorDeploymentSlotsTable)
    .set({ isActive: false, revokedAt: new Date() })
    .where(eq(operatorDeploymentSlotsTable.id, req.params.slotId));

  res.json({ ok: true, revoked: req.params.slotId });
});

export default router;
