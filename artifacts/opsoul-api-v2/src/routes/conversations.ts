import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db-v2';
import { conversationsTable, messagesTable, operatorsTable } from '@workspace/db-v2';
import { eq, and, asc, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { resolveScope } from '../utils/scopeResolver.js';

const router = Router({ mergeParams: true });

async function resolveOperator(req: Request, res: Response): Promise<{ id: string; layer2Soul: unknown } | null> {
  const [op] = await db.select({ id: operatorsTable.id, layer2Soul: operatorsTable.layer2Soul })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return null; }
  return op;
}

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const convs = await db.select().from(conversationsTable)
    .where(and(eq(conversationsTable.operatorId, op.id), eq(conversationsTable.ownerId, req.owner!.ownerId)))
    .orderBy(sql`${conversationsTable.lastMessageAt} DESC NULLS LAST`);

  res.json({ operatorId: op.id, count: convs.length, conversations: convs });
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const contextName = (req.body as { contextName?: string }).contextName ?? 'Chat';
  const scope = resolveScope({ operatorId: op.id, source: 'owner', callerId: req.owner!.ownerId });

  const [conv] = await db.insert(conversationsTable).values({
    id: crypto.randomUUID(),
    operatorId: op.id,
    ownerId: req.owner!.ownerId,
    contextName,
    scopeId: scope.scopeId,
    scopeType: scope.scopeType,
    messageCount: 0,
  }).returning();

  const openingMessage = (op.layer2Soul as any)?.openingMessage as string | undefined;
  if (openingMessage?.trim()) {
    await db.insert(messagesTable).values({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      operatorId: op.id,
      role: 'assistant',
      content: openingMessage.trim(),
    });
    await db.update(conversationsTable).set({ messageCount: sql`message_count + 1` }).where(eq(conversationsTable.id, conv.id));
  }

  res.status(201).json(conv);
});

// ── Get single ────────────────────────────────────────────────────────────────

router.get('/:convId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const [conv] = await db.select().from(conversationsTable)
    .where(and(eq(conversationsTable.id, req.params.convId), eq(conversationsTable.operatorId, op.id)));
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }
  res.json(conv);
});

// ── Messages ──────────────────────────────────────────────────────────────────

router.get('/:convId/messages', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const [conv] = await db.select({ id: conversationsTable.id }).from(conversationsTable)
    .where(and(eq(conversationsTable.id, req.params.convId), eq(conversationsTable.operatorId, op.id)));
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }

  const msgs = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.conversationId, conv.id), eq(messagesTable.isInternal, false)))
    .orderBy(asc(messagesTable.createdAt));

  res.json({ conversationId: conv.id, count: msgs.length, messages: msgs });
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete('/:convId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const [conv] = await db.select({ id: conversationsTable.id }).from(conversationsTable)
    .where(and(eq(conversationsTable.id, req.params.convId), eq(conversationsTable.operatorId, op.id)));
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }

  await db.delete(messagesTable).where(eq(messagesTable.conversationId, conv.id));
  await db.delete(conversationsTable).where(eq(conversationsTable.id, conv.id));
  res.json({ ok: true, deleted: conv.id });
});

export default router;
