import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import {
  operatorsTable,
  conversationsTable,
  messagesTable,
  operatorSkillsTable,
  platformSkillsTable,
  missionContextsTable,
} from '@workspace/db';
import { embed } from '@workspace/opsoul-utils/ai';
import { requireAuth } from '../middleware/requireAuth.js';
import { lockLayer1IfUnlocked } from '../utils/lockLayer1.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import type { ActiveSkill, ActiveMissionContext } from '../utils/systemPrompt.js';
import { searchMemory, buildMemoryContext } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { streamChat, chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import type { ChatMessage } from '../utils/openrouter.js';
import type { Layer2Soul } from '../validation/operator.js';
import { eq, and, asc } from 'drizzle-orm';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const SendMessageSchema = z.object({
  message: z.string().min(1, 'message is required').max(8000),
  stream: z.boolean().default(false),
  kbSearch: z.boolean().default(true),
  kbTopN: z.number().int().min(1).max(20).default(8),
  kbMinConfidence: z.number().int().min(0).max(100).default(30),
});

async function resolveOperatorAndConv(
  req: Request,
  res: Response,
): Promise<{ operator: typeof operatorsTable.$inferSelect; conv: typeof conversationsTable.$inferSelect } | null> {
  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!operator) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, req.params.convId),
        eq(conversationsTable.operatorId, operator.id),
      ),
    );
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return null;
  }

  return { operator, conv };
}

async function buildMessageHistory(convId: string): Promise<ChatMessage[]> {
  const msgs = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(asc(messagesTable.createdAt));

  return msgs as ChatMessage[];
}

async function loadActiveSkills(operatorId: string): Promise<ActiveSkill[]> {
  const installs = await db
    .select({
      customInstructions: operatorSkillsTable.customInstructions,
      name: platformSkillsTable.name,
      instructions: platformSkillsTable.instructions,
      outputFormat: platformSkillsTable.outputFormat,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(
      and(
        eq(operatorSkillsTable.operatorId, operatorId),
        eq(operatorSkillsTable.isActive, true),
      ),
    );

  return installs;
}

async function loadMissionContext(missionContextId: string | null | undefined): Promise<ActiveMissionContext | null> {
  if (!missionContextId) return null;
  const [ctx] = await db
    .select({
      name: missionContextsTable.name,
      toneInstructions: missionContextsTable.toneInstructions,
      integrationsAllowed: missionContextsTable.integrationsAllowed,
      growLockOverride: missionContextsTable.growLockOverride,
    })
    .from(missionContextsTable)
    .where(eq(missionContextsTable.id, missionContextId));

  return ctx ?? null;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const ctx = await resolveOperatorAndConv(req, res);
  if (!ctx) return;

  const { operator, conv } = ctx;

  const parsed = SendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { message, stream, kbSearch, kbTopN, kbMinConfidence } = parsed.data;

  const [skills, missionContext] = await Promise.all([
    loadActiveSkills(operator.id),
    loadMissionContext(conv.missionContextId),
  ]);

  let kbContext = '';
  let memoryHits: MemoryHit[] = [];

  if (kbSearch) {
    try {
      const queryEmbedding = await embed(message);
      const [kbHits, memHits] = await Promise.all([
        searchBothKbs(operator.id, queryEmbedding, kbTopN, kbMinConfidence),
        searchMemory(operator.id, queryEmbedding),
      ]);
      kbContext = buildRagContext(kbHits);
      memoryHits = memHits;
    } catch {
      kbContext = '';
      memoryHits = [];
    }
  }

  const systemPrompt = buildSystemPrompt(
    {
      name: operator.name,
      archetype: operator.archetype,
      mandate: operator.mandate,
      coreValues: operator.coreValues,
      ethicalBoundaries: operator.ethicalBoundaries,
      layer2Soul: operator.layer2Soul as Layer2Soul,
    },
    kbContext,
    skills,
    missionContext,
    memoryHits,
  );

  const history = await buildMessageHistory(conv.id);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  const userMsgId = crypto.randomUUID();
  await db.insert(messagesTable).values({
    id: userMsgId,
    conversationId: conv.id,
    operatorId: operator.id,
    role: 'user',
    content: message,
    tokenCount: null,
  });

  await lockLayer1IfUnlocked(operator.id);

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let fullContent = '';
    let completionTokens = 0;
    let promptTokens = 0;

    try {
      for await (const chunk of streamChat(messages, CHAT_MODEL)) {
        if (chunk.delta) {
          fullContent += chunk.delta;
          res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
        }
        if (chunk.done && chunk.usage) {
          promptTokens = chunk.usage.promptTokens;
          completionTokens = chunk.usage.completionTokens;
        }
      }

      const asstMsgId = crypto.randomUUID();
      await db.insert(messagesTable).values({
        id: asstMsgId,
        conversationId: conv.id,
        operatorId: operator.id,
        role: 'assistant',
        content: fullContent,
        tokenCount: completionTokens || null,
      });

      await db.update(conversationsTable)
        .set({
          messageCount: (conv.messageCount ?? 0) + 2,
          lastMessageAt: new Date(),
        })
        .where(eq(conversationsTable.id, conv.id));

      res.write(`data: ${JSON.stringify({
        done: true,
        messageId: asstMsgId,
        model: CHAT_MODEL,
        usage: { promptTokens, completionTokens },
        activeSkillCount: skills.length,
        missionContext: missionContext?.name ?? null,
        memoryCount: memoryHits.length,
      })}\n\n`);
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
      res.end();
    }

  } else {
    try {
      const result = await chatCompletion(messages, CHAT_MODEL);

      const asstMsgId = crypto.randomUUID();
      await db.insert(messagesTable).values({
        id: asstMsgId,
        conversationId: conv.id,
        operatorId: operator.id,
        role: 'assistant',
        content: result.content,
        tokenCount: result.completionTokens || null,
      });

      await db.update(conversationsTable)
        .set({
          messageCount: (conv.messageCount ?? 0) + 2,
          lastMessageAt: new Date(),
        })
        .where(eq(conversationsTable.id, conv.id));

      res.json({
        messageId: asstMsgId,
        conversationId: conv.id,
        role: 'assistant',
        content: result.content,
        model: CHAT_MODEL,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        },
        activeSkillCount: skills.length,
        missionContext: missionContext?.name ?? null,
        memoryCount: memoryHits.length,
        layer1WasLocked: operator.layer1LockedAt === null,
      });
    } catch (err) {
      res.status(502).json({ error: 'AI backend error', detail: (err as Error).message });
    }
  }
});

export default router;
