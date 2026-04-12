import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db-v2';
import { conversationsTable, messagesTable } from '@workspace/db-v2';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { resolveScope } from '../utils/scopeResolver.js';

const router = Router({ mergeParams: true });

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const convs = await db.select().from(conversationsTable)
    .where(and(eq(conversationsTable.operatorId, operatorId), eq(conversationsTable.ownerId, req.owner!.ownerId)));
  res.json(convs);
});

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const { contextName } = req.body as { contextName?: string };
  const scope = resolveScope({ operatorId, source: 'owner', callerId: req.owner!.ownerId });
  const id = crypto.randomUUID();
  const [conv] = await db.insert(conversationsTable).values({
    id,
    operatorId,
    ownerId: req.owner!.ownerId,
    contextName: contextName ?? 'Chat',
    scopeId: scope.scopeId,
    scopeType: scope.scopeType,
  }).returning();
  res.status(201).json(conv);
});

router.get('/:convId/messages', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { convId } = req.params as { convId: string };
  const msgs = await db.select().from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(asc(messagesTable.createdAt));
  res.json(msgs);
});

export default router;
