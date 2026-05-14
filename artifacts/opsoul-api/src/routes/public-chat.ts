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
import { buildSlotScope, buildScopeContext } from '../utils/scopeResolver.js';
import { appendToSession, getSessionMessages } from '../utils/sessionStore.js';
import { searchMemory, distillMemoriesFromConversations } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { assembleOperatorPrompt, buildTemporalContext, containsTimeKeywords } from '../utils/systemPrompt.js';
import { applyFirewall, isArchitectureQuestion, FIREWALL_SUBSTITUTE_REPLY } from '../utils/architectureFirewall.js';
import { OperatorAgent } from '../utils/operatorAgent.js';
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

  // ── Smoke-test sandbox enforcement ───────────────────────────────────
  // Prior incident (2026-05-13): a smoke test against a production
  // operator with userId="farmer-test-42" wrote distillation-quality
  // entries into the operator's Layer 2 main memory under a fake user
  // identifier. Layer 2 is GROW-eligible and feeds the operator's
  // evolution; polluted entries surface in chat for other users until
  // manually purged. Architecturally prevent the pattern: any userId
  // matching a sandbox prefix (smoke- / test- / sandbox- / debug-) is
  // accepted only against the SANDBOX_OPERATOR_ID env operator (if set).
  // For all other operators it is rejected at the boundary.
  const SANDBOX_USERID_PATTERN = /^(smoke|test|sandbox|debug)[-_]/i;
  if (userId && SANDBOX_USERID_PATTERN.test(userId)) {
    const sandboxOperatorId = process.env.SANDBOX_OPERATOR_ID;
    if (!sandboxOperatorId || sandboxOperatorId !== slot.operatorId) {
      console.warn('[sandbox-guard] rejected sandbox-shaped userId on production operator', {
        operatorId: slot.operatorId,
        userId,
        sandboxOperatorId: sandboxOperatorId ?? '(not set)',
      });
      res.status(403).json({
        error: 'Sandbox-shaped userIds (smoke-, test-, sandbox-, debug-) may only be used against the SANDBOX_OPERATOR_ID. Run smoke tests against a dedicated sandbox operator.',
      });
      return;
    }
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

  // ── OPERATOR-IN-CONTROL ───────────────────────────────────────────────
  // STEP 1 — Operator analyses the user message BEFORE any LLM is called.
  // Public-chat operators are not in birth mode (birth happens in the
  // owner workspace only). The OperatorAgent owns the decision; this
  // route just executes what the operator decides.
  const agent = new OperatorAgent({
    operatorId: operator.id,
    operatorName: operator.name,
    isBirthMode: false,
    scopeType: scope.scopeType,
  });

  const decision = agent.analyse(message);
  if (decision.kind === 'refuse_architecture') {
    const refusalText = agent.composeArchitectureRefusal();
    console.warn('[operator:refuse]', JSON.stringify({
      path: 'public-chat',
      operatorId: slot.operatorId,
      reason: 'architecture_introspection',
      message: message.slice(0, 200),
    }));
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write(`data: ${JSON.stringify({ delta: refusalText })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, conversationId: conversationId ?? crypto.randomUUID(), scopeId: 'operator-direct' })}\n\n`);
      res.end();
    } else {
      res.json({
        conversationId: conversationId ?? crypto.randomUUID(),
        message: { role: 'assistant', content: refusalText },
        scopeId: 'operator-direct',
      });
    }
    return;
  }

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
  // Scope context: tell the operator they are speaking with an authenticated
  // user (with the user's id) or an anonymous guest (with the session id), and
  // which conversation reference applies. Memory continuity language is
  // scope-bound — Layer 2 retrieval above is also scope-filtered.
  const scopeLine = buildScopeContext({
    scope,
    conversationId: scope.writesHistory ? (conv?.id ?? null) : sessionId,
  });
  let systemPrompt = assembleOperatorPrompt(
    operator,
    null,
    { scopeLine },
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
      // STEP 3 — Operator validates the LLM's streamed draft before delivery.
      // High-confidence patterns trigger a substitute in the operator's voice;
      // log-only patterns are flagged but pass through.
      const validation = agent.validate(fullContent);
      if (validation.triggers.length > 0) {
        console.warn('[operator:validate]', JSON.stringify({
          path: 'public-chat:stream',
          operatorId: slot.operatorId,
          scopeId: scope.scopeId,
          conversationId: conv?.id,
          substituted: validation.substituted,
          triggers: validation.triggers,
        }));
      }
      let finalContent = validation.text;

      // If the operator substituted, send a final delta to overwrite what the
      // user already saw via streaming, then mark done. Frontend renders the
      // last delta as the final assistant turn.
      if (validation.substituted) {
        res.write(`data: ${JSON.stringify({ replace: true, content: finalContent })}\n\n`);
      }

      if (scope.writesHistory && conv) {
        await db.insert(messagesTable).values({
          id: crypto.randomUUID(),
          conversationId: conv.id,
          operatorId: slot.operatorId,
          role: 'assistant',
          content: finalContent,
          model: validation.substituted ? 'operator-validate' : model,
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

    // STEP 3 — Operator validates the LLM's draft (sync path).
    const validation = agent.validate(result.content);
    if (validation.triggers.length > 0) {
      console.warn('[operator:validate]', JSON.stringify({
        path: 'public-chat:sync',
        operatorId: slot.operatorId,
        scopeId: scope.scopeId,
        conversationId: conv?.id,
        substituted: validation.substituted,
        triggers: validation.triggers,
      }));
    }
    const finalContent = validation.text;

    if (scope.writesHistory && conv) {
      await db.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId: conv.id,
        operatorId: slot.operatorId,
        role: 'assistant',
        content: finalContent,
        model: validation.substituted ? 'operator-validate' : model,
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
