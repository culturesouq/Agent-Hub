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
import { buildSlotScope } from '../utils/scopeResolver.js';
import { appendToSession, getSessionMessages } from '../utils/sessionStore.js';
import { searchMemory, distillMemoriesFromConversations } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { assembleOperatorPrompt, buildTemporalContext, containsTimeKeywords } from '../utils/systemPrompt.js';
import { applyFirewall } from '../utils/architectureFirewall.js';
import type { InstalledSkill } from '../utils/skillTriggerEngine.js';
import { streamChat, chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import type { ChatMessage, ContentPart } from '../utils/openrouter.js';

import { embed } from '@workspace/opsoul-utils/ai';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import { eq, and, desc, sql } from 'drizzle-orm';

const router = Router();
router.use(requireSlotKey);

const PublicChatSchema = z.object({
  message:        z.string().min(1).max(8000),
  userId:         z.string().max(256).optional(),
  conversationId: z.string().uuid().optional(),
  stream:         z.boolean().default(false),
  attachments:    z.array(z.object({
    type:     z.enum(['image', 'text']),
    content:  z.string(),
    mimeType: z.string().optional(),
    name:     z.string().optional(),
  })).optional(),
});


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

  const { message, userId, conversationId, stream, attachments } = parsed.data;

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
  const scope = buildSlotScope(
    slot.surfaceType,
    slot.scopeTrust ?? 'guest',
    slot.slotId,
    slot.surfaceType === 'authenticated' ? userId : undefined,
  );

  // ── Find or create conversation (DB-backed for persistent scopes only) ──
  let conv: typeof conversationsTable.$inferSelect | undefined;
  // For public scope: use an in-memory session key instead of DB conversation.
  // conversationId doubles as the sessionId so the caller can resume within TTL.
  const sessionId: string = scope.writesHistory ? '' : (conversationId ?? crypto.randomUUID());

  if (scope.writesHistory) {
    if (conversationId) {
      const [existing] = await db
        .select()
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.id, conversationId),
            eq(conversationsTable.operatorId, slot.operatorId),
          ),
        );
      if (existing) {
        conv = existing;
        scope.scopeId = existing.scopeId;
        scope.scopeType = existing.scopeType as import('../utils/scopeResolver.js').ScopeType;
      }
    }

    if (!conv && userId) {
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
        contextName: userId ? `user:${userId}` : 'guest',
        scopeId: scope.scopeId,
        scopeType: scope.scopeType,
        messageCount: 0,
      }).returning();
      conv = newConv;
    }
  }

  // ── Message history ──
  let history: ChatMessage[];

  if (scope.writesHistory && conv) {
    const historyRows = await db
      .select({ role: messagesTable.role, content: messagesTable.content })
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(messagesTable.createdAt);
    history = historyRows.map(r => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
  } else {
    // Public scope — recall from in-memory session (empty on first turn)
    history = getSessionMessages(sessionId).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

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

  const activeSkills = allSkills.map(s => ({
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
      searchBothKbs(slot.operatorId, embedding, 8, 30),
    ]);
    memoryHits = hits;
    ragContext = buildRagContext(kbHits);
  } catch { /* non-fatal */ }

  // ── System prompt ──
  // KB hits + memory hits are woven into the system prompt unlabeled (per
  // § 3 rule 10 + § 4 architecture-as-secret). Operator carries them as
  // absorbed knowledge, not as labeled role:'user' exhibits the LLM might
  // quote back to users.
  let systemPrompt = assembleOperatorPrompt(
    operator,
    null,
    { scopeLine: `[SCOPE: ${scope.scopeType} | ${scope.scopeId}]` },
  );

  // Hybrid time injection — same logic as chat.ts route. When the user
  // message contains time-relevant words, prepend the current time as a
  // prompt fact. Otherwise the prompt carries no time reference. See
  // chat.ts containsTimeKeywords() for the keyword set.
  if (containsTimeKeywords(message)) {
    systemPrompt = `**Current time:** ${buildTemporalContext(new Date())}.\n\n${systemPrompt}`;
  }

  const promptSections: string[] = [systemPrompt];
  if (ragContext && ragContext.trim()) {
    promptSections.push(ragContext.trim());
  }
  if (memoryHits && memoryHits.length > 0) {
    promptSections.push((memoryHits as MemoryHit[]).map(m => m.content).join('\n'));
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: promptSections.join('\n\n') },
    ...history,
  ];

  // Build userContent — multipart if attachments present
  let userContent: string | ContentPart[] = message;
  if (attachments && attachments.length > 0) {
    const parts: ContentPart[] = [{ type: 'text', text: message }];
    for (const att of attachments) {
      if (att.type === 'image') {
        parts.push({ type: 'image_url', image_url: { url: `data:${att.mimeType ?? 'image/jpeg'};base64,${att.content}` } });
      } else if (att.type === 'text') {
        parts.push({ type: 'text', text: `[Attached file: ${att.name ?? 'document'}]\n${att.content}` });
      }
    }
    userContent = parts;
  }
  messages.push({ role: 'user', content: userContent });

  // ── Detect context-injection messages (silent, never shown in workspace) ──
  const INJECTION_PATTERN = /^(?:GUEST_MODE|SESSION_TYPE|FOUNDER_DATA|USER_DATA|CONTEXT_BLOCK|SYSTEM_CONTEXT|__CONTEXT|__META)[:=]/m;
  const isInternal = INJECTION_PATTERN.test(message);

  // ── Store user message ──
  if (scope.writesHistory && conv) {
    await db.insert(messagesTable).values({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      operatorId: slot.operatorId,
      role: 'user',
      content: message,
      isInternal,
    });
  }

  let model = (operator.defaultModel && operator.defaultModel !== 'opsoul/auto')
    ? operator.defaultModel
    : CHAT_MODEL;
  // Force vision-capable model when image attachments are present
  if (attachments && attachments.some((a) => a.type === 'image')) {
    model = 'google/gemini-2.0-flash-001';
  }

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

      // Architecture firewall — patent claim protection at the output boundary.
      // High-confidence patterns (Layer N, GROW engine, OpSoul, etc.) trigger
      // a substitute reply. Log-only patterns (generic "embedding", "knowledge
      // stores") are flagged but pass through.
      const fw = applyFirewall(fullContent);
      if (fw.triggers.length > 0) {
        console.warn('[firewall]', JSON.stringify({
          path: 'public-chat:stream',
          operatorId: slot.operatorId,
          scopeId: scope.scopeId,
          conversationId: conv?.id,
          blocked: fw.blocked,
          triggers: fw.triggers,
        }));
      }
      let finalContent = fw.text;

      // If the firewall blocked, send a final delta to overwrite what the
      // user already saw via streaming, then mark done. Frontend renders the
      // last delta as the final assistant turn.
      if (fw.blocked) {
        res.write(`data: ${JSON.stringify({ replace: true, content: finalContent })}\n\n`);
      }

      if (scope.writesHistory && conv) {
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
        distillMemoriesFromConversations(
          slot.operatorId,
          slot.ownerId,
          operator.name,
          scope.scopeId,
          scope.scopeTrust,
        ).catch(() => {});
      } else {
        appendToSession(sessionId, slot.operatorId, [
          { role: 'user', content: message },
          { role: 'assistant', content: finalContent },
        ]);
      }

      const responseConvId = scope.writesHistory ? conv!.id : sessionId;
      res.write(`data: ${JSON.stringify({ done: true, conversationId: responseConvId, scopeId: scope.scopeId })}\n\n`);
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

    // Architecture firewall — same as streaming path.
    const fw = applyFirewall(result.content);
    if (fw.triggers.length > 0) {
      console.warn('[firewall]', JSON.stringify({
        path: 'public-chat:sync',
        operatorId: slot.operatorId,
        scopeId: scope.scopeId,
        conversationId: conv?.id,
        blocked: fw.blocked,
        triggers: fw.triggers,
      }));
    }
    const finalContent = fw.text;

    if (scope.writesHistory && conv) {
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
      distillMemoriesFromConversations(
        slot.operatorId,
        slot.ownerId,
        operator.name,
        scope.scopeId,
        scope.scopeTrust,
      ).catch(() => {});
    } else {
      appendToSession(sessionId, slot.operatorId, [
        { role: 'user', content: message },
        { role: 'assistant', content: finalContent },
      ]);
    }

    const responseConvId = scope.writesHistory ? conv!.id : sessionId;
    res.json({
      conversationId: responseConvId,
      message: { role: 'assistant', content: finalContent },
      scopeId: scope.scopeId,
    });
  }
});

export default router;
