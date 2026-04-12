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

  // attach operatorCount per owner
  const opCounts = await db
    .select({ ownerId: operatorsTable.ownerId, cnt: sql<number>`count(*)::int` })
    .from(operatorsTable)
    .groupBy(operatorsTable.ownerId);

  const countMap = Object.fromEntries(opCounts.map((r) => [r.ownerId, r.cnt]));

  res.json(owners.map((o) => ({ ...o, operatorCount: countMap[o.id] ?? 0 })));
});

router.get('/operators', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const operators = await db.select({
    id: operatorsTable.id,
    name: operatorsTable.name,
    ownerId: operatorsTable.ownerId,
    archetype: operatorsTable.archetype,
    safeMode: operatorsTable.safeMode,
    growLockLevel: operatorsTable.growLockLevel,
    createdAt: operatorsTable.createdAt,
  }).from(operatorsTable);

  // attach ownerEmail and messageCount
  const [ownerRows, msgCounts] = await Promise.all([
    db.select({ id: ownersTable.id, email: ownersTable.email }).from(ownersTable),
    db
      .select({ operatorId: messagesTable.operatorId, cnt: sql<number>`count(*)::int` })
      .from(messagesTable)
      .groupBy(messagesTable.operatorId),
  ]);

  const ownerMap = Object.fromEntries(ownerRows.map((o) => [o.id, o.email]));
  const msgMap = Object.fromEntries(msgCounts.map((r) => [r.operatorId, r.cnt]));

  res.json(operators.map((op) => ({
    ...op,
    ownerEmail: ownerMap[op.ownerId] ?? null,
    messageCount: msgMap[op.id] ?? 0,
    driftScore: null,
  })));
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

  if (alerts.length === 0) { res.json([]); return; }

  // attach operatorName and ownerEmail
  const opIds = [...new Set(alerts.map((a) => a.operatorId).filter(Boolean))] as string[];
  const ops = opIds.length > 0
    ? await db.select({ id: operatorsTable.id, name: operatorsTable.name, ownerId: operatorsTable.ownerId }).from(operatorsTable)
    : [];
  const ownerIds = [...new Set(ops.map((o) => o.ownerId))];
  const owners = ownerIds.length > 0
    ? await db.select({ id: ownersTable.id, email: ownersTable.email }).from(ownersTable)
    : [];

  const opMap = Object.fromEntries(ops.map((o) => [o.id, o]));
  const ownerEmailMap = Object.fromEntries(owners.map((o) => [o.id, o.email]));

  res.json(alerts.map((alert) => {
    const op = alert.operatorId ? opMap[alert.operatorId] : null;
    return {
      ...alert,
      operatorName: op?.name ?? null,
      ownerEmail: op ? ownerEmailMap[op.ownerId] ?? null : null,
      driftScore: null,
    };
  }));
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
