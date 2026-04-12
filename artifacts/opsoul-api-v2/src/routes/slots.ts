import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db-v2';
import { operatorDeploymentSlotsTable } from '@workspace/db-v2';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const slots = await db.select({
    id: operatorDeploymentSlotsTable.id,
    name: operatorDeploymentSlotsTable.name,
    surfaceType: operatorDeploymentSlotsTable.surfaceType,
    scopeTrust: operatorDeploymentSlotsTable.scopeTrust,
    apiKeyPreview: operatorDeploymentSlotsTable.apiKeyPreview,
    isActive: operatorDeploymentSlotsTable.isActive,
    createdAt: operatorDeploymentSlotsTable.createdAt,
  }).from(operatorDeploymentSlotsTable).where(eq(operatorDeploymentSlotsTable.operatorId, operatorId));
  res.json(slots);
});

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const { name, surfaceType, scopeTrust, allowedOrigins } = req.body as {
    name?: string; surfaceType?: string; scopeTrust?: string; allowedOrigins?: string[];
  };
  if (!name || !surfaceType || !scopeTrust) { res.status(400).json({ error: 'name, surfaceType, scopeTrust required' }); return; }

  const apiKey = `sk-ops-${crypto.randomBytes(24).toString('hex')}`;
  const [slot] = await db.insert(operatorDeploymentSlotsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId: req.owner!.ownerId,
    name,
    surfaceType,
    scopeTrust,
    apiKey,
    apiKeyPreview: apiKey.slice(0, 12),
    allowedOrigins: allowedOrigins ?? null,
  }).returning();

  res.status(201).json({ ...slot, apiKey });
});

router.delete('/:slotId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, slotId } = req.params as { operatorId: string; slotId: string };
  await db.update(operatorDeploymentSlotsTable)
    .set({ revokedAt: new Date(), isActive: false })
    .where(and(eq(operatorDeploymentSlotsTable.id, slotId), eq(operatorDeploymentSlotsTable.operatorId, operatorId)));
  res.json({ ok: true });
});

export default router;
