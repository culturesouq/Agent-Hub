import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db-v2';
import { operatorDeploymentSlotsTable, operatorsTable } from '@workspace/db-v2';
import { eq, and } from 'drizzle-orm';

const router = Router();

function getSlotKey(req: Request): string | null {
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const slotKey = getSlotKey(req);
  if (!slotKey) { res.status(401).json({ error: 'Slot key required' }); return; }

  const [slot] = await db.select().from(operatorDeploymentSlotsTable)
    .where(and(eq(operatorDeploymentSlotsTable.apiKey, slotKey), eq(operatorDeploymentSlotsTable.isActive, true)));
  if (!slot) { res.status(401).json({ error: 'Invalid or revoked slot key' }); return; }

  const [operator] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, slot.operatorId));
  if (!operator) { res.status(404).json({ error: 'Operator not found' }); return; }

  res.status(501).json({ error: 'Public chat endpoint — coming soon in v3' });
});

export default router;
