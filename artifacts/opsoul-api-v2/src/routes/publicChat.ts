import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import {
  operatorsTable,
  operatorDeploymentSlotsTable,
  conversationsTable,
  messagesTable,
} from '@workspace/db-v2';
import { eq, and, desc, sql } from 'drizzle-orm';
import { resolveScope } from '../utils/scopeResolver.js';
import { searchMemory, distillMemoriesFromConversations } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import type { Layer2Soul } from '../utils/systemPrompt.js';
import { streamChat, chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import type { ChatMessage } from '../utils/openrouter.js';
import { embed } from '@workspace/opsoul-utils/ai';

const router = Router();

function getSlotKey(req: Request): string | null {
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const PublicChatSchema = z.object({
  message:        z.string().min(1).max(8000),
  userId:         z.string().max(256).optional(),
  conversationId: z.string().uuid().optional(),
  stream:         z.boolean().default(false),
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const rawKey = getSlotKey(req);
  if (!rawKey) { res.status(401).json({ error: 'Slot key required' }); return; }

  const hashedKey = hashKey(rawKey);
  const [slot] = await db.select().from(operatorDeploymentSlotsTable)
    .where(and(eq(operatorDeploymentSlotsTable.apiKey, hashedKey), eq(operatorDeploymentSlotsTable.isActive, true)));

  if (!slot) { res.status(401).json({ error: 'Invalid or revoked slot key' }); return; }

  if (slot.surfaceType === 'workspace') {
    res.status(403).json({ error: 'workspace slots do not support the public chat endpoint' });
    return;
  }
  if (slot.surfaceType === 'crud') {
    res.status(403).json({ error: 'crud slots do not support chat — use POST /v3/action instead' });
    return;
  }

  const parsed = PublicChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { message, userId, conversationId, stream } = parsed.data;

  if (slot.surfaceType === 'authenticated' && !userId) {
    res.status(400).json({ error: 'userId is required for authenticated slots' });
    return;
  }

  const [operator] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, slot.operatorId));
  if (!operator) { res.status(404).json({ error: 'Operator not found' }); return; }

  const isAuthenticated = slot.surfaceType === 'authenticated';
  const scopeCallerId = isAuthenticated ? (userId ?? slot.id) : crypto.randomUUID();

  const scope = resolveScope({
    operatorId: slot.operatorId,
    source: isAuthenticated ? 'slot' : 'guest',
    callerId: scopeCallerId,
  });

  let conv: typeof conversationsTable.$inferSelect | undefined;

  if (conversationId) {
    const [existing] = await db
      .select()
      .from(conversationsTable)
      .where(and(
        eq(conversationsTable.id, conversationId),
        eq(conversationsTable.operatorId, slot.operatorId),
        eq(conversationsTable.scopeId, scope.scopeId),
      ));
    conv = existing;
  }

  if (!conv && isAuthenticated && userId) {
    const [existing] = await db
      .select()
      .from(conversationsTable)
      .where(and(
        eq(conversationsTable.operatorId, slot.operatorId),
        eq(conversationsTable.scopeId, scope.scopeId),
      ))
      .orderBy(desc(conversationsTable.lastMessageAt))
      .limit(1);
    conv = existing;
  }

  if (!conv) {
    const [newConv] = await db.insert(conversationsTable).values({
      id: crypto.randomUUID(),
      operatorId: slot.operatorId,
      ownerId: slot.ownerId,
      contextName: isAuthenticated ? `user:${userId}` : 'guest',
      scopeId: scope.scopeId,
      scopeType: scope.scopeType,
      messageCount: 0,
    }).returning();
    conv = newConv;
  }

  const historyRows = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(and(eq(messagesTable.conversationId, conv.id), eq(messagesTable.isInternal, false)))
    .orderBy(messagesTable.createdAt);

  const history: ChatMessage[] = historyRows.map(r => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));

  let memoryHits: MemoryHit[] = [];
  let ragContext = '';

  try {
    const embedding = await embed(message);
    const [hits, kbHits] = await Promise.all([
      searchMemory(slot.operatorId, embedding, 8, 0.55, 0.1, scope.scopeId),
      searchBothKbs(
        slot.operatorId,
        embedding,
        8,
        30,
        operator.archetype ?? [],
        operator.domainTags ?? [],
      ),
    ]);
    memoryHits = hits;
    ragContext = buildRagContext(kbHits);
  } catch { /* non-fatal */ }

  const systemPrompt = buildSystemPrompt(
    {
      name:              operator.name,
      archetype:         operator.archetype as string[],
      rawIdentity:       operator.rawIdentity ?? undefined,
      mandate:           operator.mandate,
      coreValues:        operator.coreValues as string[],
      ethicalBoundaries: operator.ethicalBoundaries as string[],
      layer2Soul:        operator.layer2Soul as Layer2Soul,
    },
    ragContext,
    [],
    memoryHits,
    null,
    { webSearchAvailable: false },
  );

  const messages: ChatMessage[] = [
    ...history,
    { role: 'user', content: message },
  ];

  const INJECTION_PATTERN = /^(?:GUEST_MODE|SESSION_TYPE|FOUNDER_DATA|USER_DATA|CONTEXT_BLOCK|SYSTEM_CONTEXT|__CONTEXT|__META)[:=]/m;
  const isInternal = INJECTION_PATTERN.test(message);

  await db.insert(messagesTable).values({
    id: crypto.randomUUID(),
    conversationId: conv.id,
    operatorId: slot.operatorId,
    role: 'user',
    content: message,
    isInternal,
  });

  const model = (operator.defaultModel && operator.defaultModel !== 'opsoul/auto')
    ? operator.defaultModel
    : CHAT_MODEL;

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullContent = '';

    try {
      for await (const chunk of streamChat([{ role: 'system', content: systemPrompt }, ...messages], model)) {
        if (chunk.delta) {
          fullContent += chunk.delta;
          res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
        }
      }

      await db.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId: conv.id,
        operatorId: slot.operatorId,
        role: 'assistant',
        content: fullContent,
      });

      await db.update(conversationsTable)
        .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conv.id));

      if (isAuthenticated) {
        distillMemoriesFromConversations(slot.operatorId, slot.ownerId, operator.name).catch(() => {});
      }

      res.write(`data: ${JSON.stringify({ done: true, conversationId: conv.id, scopeId: scope.scopeId })}\n\n`);
      res.end();
    } catch (streamErr: unknown) {
      const streamStatus = (streamErr as { status?: number })?.status;
      const msg = streamStatus === 402
        ? 'AI service temporarily unavailable. Please try again shortly.'
        : 'Stream failed. Please try again.';
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    }

  } else {
    let result;
    try {
      result = await chatCompletion(
        [{ role: 'system', content: systemPrompt }, ...messages],
        { model },
      );
    } catch (llmErr: unknown) {
      const status = (llmErr as { status?: number })?.status;
      if (status === 402) {
        res.status(503).json({ error: 'AI service temporarily unavailable. Please try again shortly.' });
      } else {
        res.status(502).json({ error: 'AI service error. Please try again.' });
      }
      return;
    }

    await db.insert(messagesTable).values({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      operatorId: slot.operatorId,
      role: 'assistant',
      content: result.content,
    });

    await db.update(conversationsTable)
      .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, conv.id));

    if (isAuthenticated) {
      distillMemoriesFromConversations(slot.operatorId, slot.ownerId, operator.name).catch(() => {});
    }

    res.json({
      conversationId: conv.id,
      message: { role: 'assistant', content: result.content },
      scopeId: scope.scopeId,
    });
  }
});

export default router;
