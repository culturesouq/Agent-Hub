import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import {
  ownersTable,
  operatorsTable,
  messagesTable,
  selfAwarenessStateTable,
  opsLogsTable,
} from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { eq, sql, and, gte, desc } from 'drizzle-orm';
import { backfillTelegramWebhookSecrets } from '../utils/backfillTelegramSecrets.js';
import { backfillWhatsAppAppSecrets } from '../utils/backfillWhatsAppSecrets.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
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

router.get('/owners', async (_req: Request, res: Response): Promise<void> => {
  const owners = await db
    .select({
      id: ownersTable.id,
      email: ownersTable.email,
      name: ownersTable.name,
      isSovereignAdmin: ownersTable.isSovereignAdmin,
      createdAt: ownersTable.createdAt,
      operatorCount: sql<number>`(
        select count(*)::int from operators where owner_id = owners.id
      )`,
    })
    .from(ownersTable)
    .orderBy(desc(ownersTable.createdAt));

  res.json(owners);
});

router.get('/operators', async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({
      id: operatorsTable.id,
      name: operatorsTable.name,
      ownerId: operatorsTable.ownerId,
      archetype: operatorsTable.archetype,
      safeMode: operatorsTable.safeMode,
      growLockLevel: operatorsTable.growLockLevel,
      createdAt: operatorsTable.createdAt,
      ownerEmail: sql<string>`(
        select email from owners where id = operators.owner_id
      )`,
      driftScore: sql<number | null>`(
        select (soul_state->>'driftScore')::float
        from self_awareness_state
        where operator_id = operators.id
      )`,
      messageCount: sql<number>`(
        select count(*)::int from messages where operator_id = operators.id
      )`,
    })
    .from(operatorsTable)
    .orderBy(desc(operatorsTable.createdAt));

  res.json(rows);
});

router.get('/drift-alerts', async (_req: Request, res: Response): Promise<void> => {
  const alerts = await db
    .select({
      id: opsLogsTable.id,
      operatorId: opsLogsTable.operatorId,
      createdAt: opsLogsTable.createdAt,
      resolvedAt: opsLogsTable.resolvedAt,
      operatorName: sql<string>`(
        select name from operators where id = ops_logs.operator_id
      )`,
      ownerEmail: sql<string>`(
        select o.email from owners o
        join operators op on op.owner_id = o.id
        where op.id = ops_logs.operator_id
      )`,
      driftScore: sql<number | null>`(
        select (soul_state->>'driftScore')::float
        from self_awareness_state
        where operator_id = ops_logs.operator_id
      )`,
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

router.patch('/owners/:id/toggle-admin', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
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

router.post('/backfill/telegram-webhook-secrets', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await backfillTelegramWebhookSecrets();
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[admin] backfill telegram webhook secrets failed:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

router.post('/backfill/whatsapp-app-secrets', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await backfillWhatsAppAppSecrets();
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[admin] backfill whatsapp app secrets failed:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
