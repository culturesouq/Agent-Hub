import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db-v2';
import { ownersTable, operatorsTable, messagesTable, opsLogsTable } from '@workspace/db-v2';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { eq, and, gte, desc, sql } from 'drizzle-orm';

const router = Router();

router.get('/stats', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [[ownerCount], [operatorCount], [msgCount], [driftCount]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(ownersTable),
    db.select({ count: sql<number>`count(*)::int` }).from(operatorsTable),
    db.select({ count: sql<number>`count(*)::int` }).from(messagesTable)
      .where(gte(messagesTable.createdAt, new Date(Date.now() - 86_400_000))),
    db.select({ count: sql<number>`count(*)::int` }).from(opsLogsTable)
      .where(and(
        eq(opsLogsTable.errorType, 'soul_drift_flagged'),
        eq(opsLogsTable.logTier, 'warn'),
      )),
  ]);

  res.json({
    totalOwners: ownerCount.count,
    totalOperators: operatorCount.count,
    messagesLast24h: msgCount.count,
    driftAlerts: driftCount.count,
  });
});

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

router.get('/drift-alerts', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const alerts = await db
    .select({
      id: opsLogsTable.id,
      operatorId: opsLogsTable.operatorId,
      createdAt: opsLogsTable.createdAt,
      resolvedAt: opsLogsTable.resolvedAt,
    })
    .from(opsLogsTable)
    .where(and(
      eq(opsLogsTable.errorType, 'soul_drift_flagged'),
      eq(opsLogsTable.logTier, 'warn'),
    ))
    .orderBy(desc(opsLogsTable.createdAt))
    .limit(50);

  res.json(alerts);
});

router.patch('/owners/:id/toggle-admin', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, id));
  if (!owner) {
    res.status(404).json({ error: 'Owner not found' });
    return;
  }

  const [updated] = await db
    .update(ownersTable)
    .set({ isSovereignAdmin: !owner.isSovereignAdmin })
    .where(eq(ownersTable.id, id))
    .returning({ id: ownersTable.id, isSovereignAdmin: ownersTable.isSovereignAdmin });

  res.json(updated);
});

export default router;
