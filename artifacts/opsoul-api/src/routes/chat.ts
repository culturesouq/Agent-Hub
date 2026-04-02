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
  selfAwarenessStateTable,
} from '@workspace/db';
import { embed, semanticDistance } from '@workspace/opsoul-utils/ai';
import { requireAuth } from '../middleware/requireAuth.js';
import { lockLayer1IfUnlocked } from '../utils/lockLayer1.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import type { ActiveSkill, ActiveMissionContext, SelfAwarenessSnapshot, BuildSystemPromptOpts } from '../utils/systemPrompt.js';
import { searchMemory, buildMemoryContext, distillMemoriesFromConversations } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
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

  const [skills, missionContext, selfAwarenessRow, history] = await Promise.all([
    loadActiveSkills(operator.id),
    loadMissionContext(conv.missionContextId),
    db.select().from(selfAwarenessStateTable).where(eq(selfAwarenessStateTable.operatorId, operator.id)).limit(1),
    buildMessageHistory(conv.id),
  ]);

  const selfAwareness: SelfAwarenessSnapshot | null = selfAwarenessRow[0]
    ? {
        healthScore: selfAwarenessRow[0].healthScore as { score: number; label: string } | null,
        mandateGaps: selfAwarenessRow[0].mandateGaps ?? null,
        lastUpdateTrigger: selfAwarenessRow[0].lastUpdateTrigger ?? null,
        lastUpdated: selfAwarenessRow[0].lastUpdated ?? null,
        soulState: selfAwarenessRow[0].soulState as SelfAwarenessSnapshot['soulState'],
        capabilityState: selfAwarenessRow[0].capabilityState as SelfAwarenessSnapshot['capabilityState'],
      }
    : null;

  // Q7 — Sycophancy detection: cosine distance between first and last assistant message.
  // Only runs when there are 6+ messages in history. Silently adds position-hold reminder to prompt.
  let sycophancyWarning = false;
  if (history.length >= 6) {
    const assistantMsgs = history.filter((m) => m.role === 'assistant');
    if (assistantMsgs.length >= 2) {
      try {
        const dist = await semanticDistance(
          assistantMsgs[0].content,
          assistantMsgs[assistantMsgs.length - 1].content,
        );
        sycophancyWarning = dist > 0.35;
      } catch {
        // non-critical — skip silently
      }
    }
  }

  // Q8 — Soul anchoring: if history token estimate exceeds 40% of 128k context window,
  // reinject Layer 0 + Layer 1 at top of system prompt to reinforce identity.
  const CONTEXT_WINDOW = 128_000;
  const ANCHOR_THRESHOLD = Math.floor(CONTEXT_WINDOW * 0.4); // 51,200 tokens
  const historyTokenEstimate = history.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  const soulAnchorActive = historyTokenEstimate > ANCHOR_THRESHOLD;

  // T2 — Language detection: Arabic Unicode blocks (Arabic, Arabic Supplement, Arabic Extended-A)
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(message);
  const languageInstruction = hasArabic
    ? 'The user is writing in Arabic. Respond in Arabic. Match their dialect if possible.'
    : undefined;

  const promptOpts: BuildSystemPromptOpts = { sycophancyWarning, soulAnchorActive, languageInstruction };

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
    selfAwareness,
    promptOpts,
  );

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

      if (!operator.safeMode) {
        triggerSelfAwareness(operator.id, 'conversation_end').catch(() => {});
        distillMemoriesFromConversations(operator.id, operator.ownerId, operator.name).catch(() => {});
      }
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

      if (!operator.safeMode) {
        triggerSelfAwareness(operator.id, 'conversation_end').catch(() => {});
        distillMemoriesFromConversations(operator.id, operator.ownerId, operator.name).catch(() => {});
      }
    } catch (err) {
      res.status(502).json({ error: 'AI backend error', detail: (err as Error).message });
    }
  }
});

export default router;
