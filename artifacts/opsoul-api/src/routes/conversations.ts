import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import { conversationsTable, operatorsTable, messagesTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { resolveScope } from '../utils/scopeResolver.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const CreateConversationSchema = z.object({
  contextName: z.string().min(1).max(100).default('default'),
});

async function resolveOperator(req: Request, res: Response): Promise<{ id: string; soul: any } | null> {
  const [op] = await db
    .select({ id: operatorsTable.id, soul: operatorsTable.layer2Soul })
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
  return op;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const parsed = CreateConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const scope = resolveScope({ operatorId: op.id, source: 'owner', callerId: req.owner!.ownerId });

  const [conv] = await db.insert(conversationsTable).values({
    id: crypto.randomUUID(),
    operatorId: op.id,
    ownerId: req.owner!.ownerId,
    contextName: parsed.data.contextName,
    scopeId: scope.scopeId,
    scopeType: scope.scopeType,
    messageCount: 0,
  }).returning();

  const openingMessage = (op.soul as any)?.openingMessage as string | undefined;
  if (openingMessage?.trim()) {
    await db.insert(messagesTable).values({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      operatorId: op.id,
      role: 'assistant',
      content: openingMessage.trim(),
    });
    await db
      .update(conversationsTable)
      .set({ messageCount: sql`message_count + 1` })
      .where(eq(conversationsTable.id, conv.id));
  }

  res.status(201).json(conv);
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const convs = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.operatorId, op.id),
        eq(conversationsTable.ownerId, req.owner!.ownerId),
        eq(conversationsTable.scopeType, 'owner'),
      ),
    )
    .orderBy(sql`${conversationsTable.lastMessageAt} DESC NULLS LAST`);

  res.json({ operatorId: op.id, count: convs.length, conversations: convs });
});

router.get('/:convId', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, req.params.convId),
        eq(conversationsTable.operatorId, op.id),
      ),
    );

  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }
  res.json(conv);
});

router.get('/:convId/messages', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, req.params.convId),
        eq(conversationsTable.operatorId, op.id),
      ),
    );

  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }

  const msgs = await db
    .select()
    .from(messagesTable)
    .where(and(eq(messagesTable.conversationId, conv.id), eq(messagesTable.isInternal, false)))
    .orderBy(messagesTable.createdAt);

  res.json({ conversationId: conv.id, count: msgs.length, messages: msgs });
});

router.delete('/:convId', async (req: Request, res: Response): Promise<void> => {
  const op = await resolveOperator(req, res);
  if (!op) return;

  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, req.params.convId),
        eq(conversationsTable.operatorId, op.id),
      ),
    );

  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }

  await db.delete(messagesTable).where(eq(messagesTable.conversationId, conv.id));
  await db.delete(conversationsTable).where(eq(conversationsTable.id, conv.id));

  res.json({ ok: true, deleted: conv.id });
});

export default router;
