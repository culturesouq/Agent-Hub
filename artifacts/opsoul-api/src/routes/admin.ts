import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import {
  ownersTable,
  operatorsTable,
  messagesTable,
  conversationsTable,
  selfAwarenessStateTable,
  opsLogsTable,
} from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { eq, sql, and, gte, desc, asc, isNull } from 'drizzle-orm';
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
    .where(isNull(operatorsTable.deletedAt))
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

// ── Operator controls ──────────────────────────────────────────────────────

router.patch('/operators/:id/safe-mode', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { safeMode } = req.body as { safeMode?: boolean };
  if (typeof safeMode !== 'boolean') {
    res.status(400).json({ error: 'safeMode (boolean) is required' });
    return;
  }
  const [updated] = await db
    .update(operatorsTable)
    .set({ safeMode })
    .where(eq(operatorsTable.id, id))
    .returning({ id: operatorsTable.id, safeMode: operatorsTable.safeMode });
  if (!updated) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(updated);
});

router.patch('/operators/:id/grow-lock', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { level } = req.body as { level?: string };
  const VALID_LEVELS = ['OPEN', 'CONTROLLED', 'LOCKED', 'FROZEN'] as const;
  if (!level || !VALID_LEVELS.includes(level as typeof VALID_LEVELS[number])) {
    res.status(400).json({ error: `level must be one of: ${VALID_LEVELS.join(', ')}` });
    return;
  }
  const [updated] = await db
    .update(operatorsTable)
    .set({ growLockLevel: level })
    .where(eq(operatorsTable.id, id))
    .returning({ id: operatorsTable.id, growLockLevel: operatorsTable.growLockLevel });
  if (!updated) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(updated);
});

router.delete('/operators/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const [updated] = await db
    .update(operatorsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(operatorsTable.id, id), isNull(operatorsTable.deletedAt)))
    .returning({ id: operatorsTable.id });
  if (!updated) { res.status(404).json({ error: 'Operator not found or already deleted' }); return; }
  res.json({ ok: true });
});

// ── Owner delete ───────────────────────────────────────────────────────────

router.delete('/owners/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const [owner] = await db.select({ id: ownersTable.id }).from(ownersTable).where(eq(ownersTable.id, id));
  if (!owner) { res.status(404).json({ error: 'Owner not found' }); return; }

  await db
    .update(operatorsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(operatorsTable.ownerId, id), isNull(operatorsTable.deletedAt)));

  await db.delete(ownersTable).where(eq(ownersTable.id, id));

  res.json({ ok: true });
});

// ── Conversations inspector ────────────────────────────────────────────────

router.get('/operators/:id/conversations', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const conversations = await db
    .select({
      id: conversationsTable.id,
      createdAt: conversationsTable.createdAt,
      messageCount: conversationsTable.messageCount,
      contextName: conversationsTable.contextName,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.operatorId, id))
    .orderBy(desc(conversationsTable.createdAt))
    .limit(50);
  res.json(conversations);
});

router.get('/conversations/:id/messages', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const messages = await db
    .select({
      role: messagesTable.role,
      content: messagesTable.content,
      createdAt: messagesTable.createdAt,
    })
    .from(messagesTable)
    .where(and(
      eq(messagesTable.conversationId, id),
      eq(messagesTable.isInternal, false),
    ))
    .orderBy(asc(messagesTable.createdAt));
  res.json(messages);
});

// ── Backfill utilities ─────────────────────────────────────────────────────

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
