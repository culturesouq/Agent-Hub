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
} from '@workspace/db';
import { requireSlotKey } from '../middleware/requireSlotKey.js';
import { resolveScope } from '../utils/scopeResolver.js';
import { searchMemory, buildMemoryContext, distillMemoriesFromConversations } from '../utils/memoryEngine.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import { detectSkillTrigger } from '../utils/skillTriggerEngine.js';
import type { InstalledSkill } from '../utils/skillTriggerEngine.js';
import { executeSkill } from '../utils/skillExecutor.js';
import { streamChat, chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { ActiveSkill } from '../utils/systemPrompt.js';

const router = Router();
router.use(requireSlotKey);

const PublicChatSchema = z.object({
  message:        z.string().min(1).max(8000),
  userId:         z.string().max(256).optional(),
  conversationId: z.string().uuid().optional(),
  stream:         z.boolean().default(false),
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const slot = req.slot!;

  // surface guards
  if (slot.surfaceType === 'workspace') {
    res.status(403).json({ error: 'workspace slots do not support the public chat endpoint' });
    return;
  }
  if (slot.surfaceType === 'crud') {
    res.status(403).json({ error: 'crud slots do not support chat — use POST /v1/action instead' });
    return;
  }

  const parsed = PublicChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { message, userId, conversationId, stream } = parsed.data;

  // authenticated requires userId
  if (slot.surfaceType === 'authenticated' && !userId) {
    res.status(400).json({ error: 'userId is required for authenticated slots' });
    return;
  }

  // ── Load operator ──
  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.id, slot.operatorId));

  if (!operator) {
    res.status(404).json({ error: 'Operator not found' });
    return;
  }

  // ── Resolve scope ──
  const scope = resolveScope({
    operatorId: slot.operatorId,
    source: slot.surfaceType,
    callerId: slot.surfaceType === 'authenticated' ? userId : undefined,
    slotId: slot.slotId,
    scopeTrust: slot.scopeTrust,
  });

  // ── Find or create conversation ──
  let conv: typeof conversationsTable.$inferSelect | undefined;

  if (conversationId) {
    const [existing] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.operatorId, slot.operatorId),
          eq(conversationsTable.scopeId, scope.scopeId),
        ),
      );
    conv = existing;
  }

  if (!conv && slot.surfaceType === 'authenticated' && userId) {
    const [existing] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.operatorId, slot.operatorId),
          eq(conversationsTable.scopeId, scope.scopeId),
        ),
      )
      .orderBy(desc(conversationsTable.lastMessageAt))
      .limit(1);
    conv = existing;
  }

  if (!conv) {
    const [newConv] = await db.insert(conversationsTable).values({
      id: crypto.randomUUID(),
      operatorId: slot.operatorId,
      ownerId: slot.ownerId,
      contextName: slot.surfaceType === 'authenticated' ? `user:${userId}` : 'guest',
      scopeId: scope.scopeId,
      scopeType: scope.scopeType,
      messageCount: 0,
    }).returning();
    conv = newConv;
  }

  // ── Message history ──
  const historyRows = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conv.id))
    .orderBy(messagesTable.createdAt);

  const history = historyRows.map(r => ({ role: r.role as 'user' | 'assistant', content: r.content }));

  // ── Skills ──
  const installedRows = await db
    .select({
      id: operatorSkillsTable.id,
      skillId: operatorSkillsTable.skillId,
      customInstructions: operatorSkillsTable.customInstructions,
      name: platformSkillsTable.name,
      instructions: platformSkillsTable.instructions,
      outputFormat: platformSkillsTable.outputFormat,
      triggerDescription: platformSkillsTable.triggerDescription,
      integrationType: platformSkillsTable.integrationType,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(and(eq(operatorSkillsTable.operatorId, slot.operatorId), eq(operatorSkillsTable.isActive, true)));

  const installedNames = new Set(installedRows.map(s => s.name));
  const archetypeDefaults = await loadArchetypeSkills(operator.archetype ?? ['All']);

  const allSkills: InstalledSkill[] = [
    ...installedRows.map(s => ({
      installId:          s.id,
      skillId:            s.skillId,
      name:               s.name,
      triggerDescription: s.triggerDescription ?? '',
      instructions:       s.instructions,
      outputFormat:       s.outputFormat ?? null,
      customInstructions: s.customInstructions ?? null,
      integrationType:    s.integrationType ?? null,
    })),
    ...archetypeDefaults
      .filter(a => !installedNames.has(a.name))
      .map(a => ({
        installId:          a.installId,
        skillId:            a.skillId,
        name:               a.name,
        triggerDescription: a.triggerDescription,
        instructions:       a.instructions,
        outputFormat:       a.outputFormat,
        customInstructions: null,
        integrationType:    a.integrationType ?? null,
      })),
  ];

  const activeSkills: ActiveSkill[] = allSkills.map(s => ({
    name: s.name,
    description: s.triggerDescription,
    instructions: s.instructions,
    outputFormat: s.outputFormat ?? undefined,
  }));

  // ── Memory search ──
  let memoryContext = '';
  try {
    const embedding = await embed(message);
    const hits = await searchMemory(slot.operatorId, embedding, 8, 0.55, 0.1, scope.scopeId);
    memoryContext = buildMemoryContext(hits);
  } catch { /* non-fatal */ }

  // ── KB search ──
  let ragContext = '';
  try {
    const embedding = await embed(message);
    const kbHits = await searchBothKbs(slot.operatorId, slot.ownerId, embedding, 8, 30);
    ragContext = buildRagContext(kbHits);
  } catch { /* non-fatal */ }

  // ── Skill trigger detection ──
  const trigger = await detectSkillTrigger(message, allSkills, operator.name);

  // ── System prompt ──
  const systemPrompt = buildSystemPrompt({
    operator,
    skills: activeSkills,
    ragContext,
    memoryContext,
  });

  const messages = [
    ...history,
    { role: 'user' as const, content: message },
  ];

  // ── Store user message ──
  const userMsgId = crypto.randomUUID();
  await db.insert(messagesTable).values({
    id: userMsgId,
    conversationId: conv.id,
    operatorId: slot.operatorId,
    role: 'user',
    content: message,
  });

  // ── Execute skill or normal LLM call ──
  if (trigger) {
    try {
      const skillResult = await executeSkill(trigger, slot.operatorId, slot.ownerId, message);

      await db.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId: conv.id,
        operatorId: slot.operatorId,
        role: 'assistant',
        content: skillResult,
      });

      await db.update(conversationsTable)
        .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conv.id));

      res.json({
        conversationId: conv.id,
        message: { role: 'assistant', content: skillResult },
        scopeId: scope.scopeId,
      });
      return;
    } catch { /* fall through to LLM */ }
  }

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
      await streamChat(
        [{ role: 'system', content: systemPrompt }, ...messages],
        model,
        (chunk) => {
          fullContent += chunk;
          res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
        },
      );

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

      res.write(`data: ${JSON.stringify({ done: true, conversationId: conv.id, scopeId: scope.scopeId })}\n\n`);
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
      res.end();
    }
  } else {
    const result = await chatCompletion(
      [{ role: 'system', content: systemPrompt }, ...messages],
      model,
    );

    const assistantContent = result.content;

    await db.insert(messagesTable).values({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      operatorId: slot.operatorId,
      role: 'assistant',
      content: assistantContent,
    });

    await db.update(conversationsTable)
      .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, conv.id));

    // Async memory distillation (authenticated only — guest memories don't persist)
    if (slot.surfaceType === 'authenticated') {
      distillMemoriesFromConversations(
        slot.operatorId,
        slot.ownerId,
        operator.name,
        scope.scopeId,
        scope.scopeTrust,
      ).catch(() => {});
    }

    res.json({
      conversationId: conv.id,
      message: { role: 'assistant', content: assistantContent },
      scopeId: scope.scopeId,
    });
  }
});

export default router;
