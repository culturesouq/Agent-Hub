import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db-v2';
import { ownersTable, operatorsTable } from '@workspace/db-v2';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/owners', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const owners = await db.select({
    id: ownersTable.id,
    email: ownersTable.email,
    name: ownersTable.name,
    isSovereignAdmin: ownersTable.isSovereignAdmin,
    createdAt: ownersTable.createdAt,
  }).from(ownersTable);
  res.json(owners);
});

router.get('/operators', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const operators = await db.select({
    id: operatorsTable.id,
    name: operatorsTable.name,
    ownerId: operatorsTable.ownerId,
    mandate: operatorsTable.mandate,
    growLockLevel: operatorsTable.growLockLevel,
    createdAt: operatorsTable.createdAt,
  }).from(operatorsTable);
  res.json(operators);
});

export default router;
