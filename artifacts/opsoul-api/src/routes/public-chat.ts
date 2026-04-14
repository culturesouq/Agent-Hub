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
import { searchMemory, distillMemoriesFromConversations } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import { detectSkillTrigger } from '../utils/skillTriggerEngine.js';
import type { InstalledSkill } from '../utils/skillTriggerEngine.js';
import { executeSkill } from '../utils/skillExecutor.js';
import { streamChat, chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import type { ChatMessage } from '../utils/openrouter.js';

import { embed } from '@workspace/opsoul-utils/ai';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import type { Layer2Soul } from '../validation/operator.js';
import { eq, and, desc, sql } from 'drizzle-orm';

interface ActiveSkill {
  name: string;
  instructions: string;
  customInstructions?: string | null;
  outputFormat?: string | null;
}

const router = Router();
router.use(requireSlotKey);

const PublicChatSchema = z.object({
  message:        z.string().min(1).max(8000),
  userId:         z.string().max(256).optional(),
  conversationId: z.string().uuid().optional(),
  stream:         z.boolean().default(false),
});

function buildSkillSecondPassMessages(
  _systemPrompt: string,
  messages: ChatMessage[],
  firstResponse: string,
  skillOutput: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: firstResponse },
    { role: 'system', content: `[Task completed — findings below]\n${skillOutput}` },
    { role: 'user', content: `You just completed a task. Report back to the owner directly — as if you did the work yourself and are now sharing what you found.\n\nBe specific. Highlight what matters. Be conversational.\n\nNever mention tool names, skill names, raw JSON, raw URLs, or API responses. Just speak naturally as their operator who got something done.` },
  ];
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const slot = req.slot!;

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

  const history: ChatMessage[] = historyRows.map(r => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));

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
    name:         s.name,
    description:  s.triggerDescription,
    instructions: s.instructions,
    outputFormat: s.outputFormat ?? undefined,
  }));

  // ── Memory + KB search ──
  let memoryHits: MemoryHit[] = [];
  let ragContext = '';

  try {
    const embedding = await embed(message);
    const [hits, kbHits] = await Promise.all([
      searchMemory(slot.operatorId, embedding, 8, 0.55, 0.1, scope.scopeId),
      searchBothKbs(slot.operatorId, slot.ownerId, embedding, 8, 30),
    ]);
    memoryHits = hits;
    ragContext = buildRagContext(kbHits);
  } catch { /* non-fatal */ }

  // ── System prompt ──
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
    null,
    { webSearchAvailable: false },
  );

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  if (ragContext && ragContext.trim()) {
    messages.push({
      role: 'user',
      content: `[CONTEXT]\nKnowledge retrieved for this conversation:\n${ragContext}`,
    });
  }

  if (memoryHits && memoryHits.length > 0) {
    const memLines = (memoryHits as MemoryHit[]).map(m => `[${m.memoryType}] ${m.content}`).join('\n');
    messages.push({
      role: 'user',
      content: `[CONTEXT]\nMemory recalled from past conversations:\n${memLines}`,
    });
  }

  messages.push({ role: 'user', content: message });

  // ── Detect context-injection messages (silent, never shown in workspace) ──
  const INJECTION_PATTERN = /^(?:GUEST_MODE|SESSION_TYPE|FOUNDER_DATA|USER_DATA|CONTEXT_BLOCK|SYSTEM_CONTEXT|__CONTEXT|__META)[:=]/m;
  const isInternal = INJECTION_PATTERN.test(message);

  // ── Store user message ──
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

  // ── STREAM PATH ────────────────────────────────────────────────────────────
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullContent = '';

    try {
      for await (const chunk of streamChat(messages, model)) {
        if (chunk.delta) {
          fullContent += chunk.delta;
          res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
        }
      }

      let finalContent = fullContent;

      // ── Skill trigger detection (after first LLM response) ──
      const trigger = await detectSkillTrigger(message, allSkills, fullContent);
      if (trigger) {
        trigger.operatorId = slot.operatorId;
        res.write(`data: ${JSON.stringify({ running: trigger.name })}\n\n`);
        const skillResult = await executeSkill(trigger, model, messages);
        if (skillResult.success) {
          const secondMessages = buildSkillSecondPassMessages(systemPrompt, messages, fullContent, skillResult.output);
          let secondContent = '';
          for await (const chunk of streamChat(secondMessages, model)) {
            if (chunk.delta) {
              secondContent += chunk.delta;
              res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
            }
          }
          finalContent = secondContent;
        }
      }

      await db.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId: conv.id,
        operatorId: slot.operatorId,
        role: 'assistant',
        content: finalContent,
      });

      await db.update(conversationsTable)
        .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conv.id));

      if (slot.surfaceType === 'authenticated') {
        distillMemoriesFromConversations(
          slot.operatorId,
          slot.ownerId,
          operator.name,
          scope.scopeId,
          scope.scopeTrust,
        ).catch(() => {});
      }

      res.write(`data: ${JSON.stringify({ done: true, conversationId: conv.id, scopeId: scope.scopeId })}\n\n`);
      res.end();
    } catch (streamErr: unknown) {
      const streamStatus = (streamErr as { status?: number })?.status;
      const streamMsg = streamStatus === 402
        ? 'AI service temporarily unavailable. Please try again shortly.'
        : 'Stream failed. Please try again.';
      res.write(`data: ${JSON.stringify({ error: streamMsg })}\n\n`);
      res.end();
    }

  // ── SYNC PATH ──────────────────────────────────────────────────────────────
  } else {
    let result;
    try {
      result = await chatCompletion(messages, model);
    } catch (llmErr: unknown) {
      const status = (llmErr as { status?: number })?.status;
      if (status === 402) {
        res.status(503).json({ error: 'AI service temporarily unavailable. Please try again shortly.' });
      } else {
        res.status(502).json({ error: 'AI service error. Please try again.' });
      }
      return;
    }

    let finalContent = result.content;

    // ── Skill trigger detection (after first LLM response) ──
    try {
      const trigger = await detectSkillTrigger(message, allSkills, result.content);
      if (trigger) {
        trigger.operatorId = slot.operatorId;
        const skillResult = await executeSkill(trigger, model, messages);
        if (skillResult.success) {
          const secondMessages = buildSkillSecondPassMessages(systemPrompt, messages, result.content, skillResult.output);
          const secondResult = await chatCompletion(secondMessages, model);
          finalContent = secondResult.content;
        }
      }
    } catch { /* skill path failure — return first response */ }

    await db.insert(messagesTable).values({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      operatorId: slot.operatorId,
      role: 'assistant',
      content: finalContent,
    });

    await db.update(conversationsTable)
      .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, conv.id));

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
      message: { role: 'assistant', content: finalContent },
      scopeId: scope.scopeId,
    });
  }
});

export default router;
