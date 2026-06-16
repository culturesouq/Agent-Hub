import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import {
  operatorsTable,
  conversationsTable,
  messagesTable,
  operatorSecretsTable,
  operatorIntegrationsTable,
} from '@workspace/db';
import { requireSlotKey } from '../middleware/requireSlotKey.js';
import { buildSlotScope, buildScopeContext } from '../utils/scopeResolver.js';
import { appendToSession, getSessionMessages } from '../utils/sessionStore.js';
import { distillMemoriesFromConversations } from '../utils/memoryEngine.js';
import { assembleOperatorPrompt, buildTemporalContext, containsTimeKeywords } from '../utils/systemPrompt.js';
import { OperatorAgent } from '../utils/operatorAgent.js';
import { buildOperatorToolset } from '../utils/operatorToolset.js';
import { runSyncAgentLoop } from '../utils/operatorAgentLoop.js';
import { analyzeInputForSafety, analyzeOutputForLeak } from '../utils/operatorFirewall.js';
import { CHAT_MODEL } from '../utils/openrouter.js';
import type { ChatMessage, ContentPart } from '../utils/openrouter.js';
import { DEFAULT_MODEL_ID } from '../utils/modelRegistry.js';

import { eq, and, desc, sql } from 'drizzle-orm';

const router = Router();
router.use(requireSlotKey);

const PublicChatSchema = z.object({
  message:        z.string().min(1).max(200000),
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

  // Patent claim 21: operator decides whether tools are offered this turn.
  // 'chat' → LLM gets no tools (cannot autonomously call any); 'execute' →
  // full tool catalogue. Passed into runSyncAgentLoop below so the LLM never
  // sees tools the operator didn't authorise. Mirrors chat.ts:613/855.
  const operatorDecision = agent.analyse(message);

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

  // Skills are surfaced to the operator through the universal toolset
  // (buildOperatorToolset below — Phase 1B / Claims 4/9/31/36). The
  // pre-MCP pattern of pre-loading installed + archetype-default skills
  // into an LLM-prompt block is gone in this surface; the agent loop
  // discovers + dispatches through the registry instead. Removed dead
  // installedRows/allSkills/activeSkills computation — they were assigned
  // but never read after the MCP refactor.

  // ── System prompt ──
  // System prompt = identity only (Layer 0 + Layer 1 + Layer 2 + Layer 4).
  // KB and memory are NOT pre-injected here. The operator retrieves them
  // on demand via kb_search and memory tools when its own reasoning decides
  // they are needed. Pre-injection drowns identity in noise — the root cause
  // of operator drift, chatty behaviour, and identity instability.
  // Scope context: tell the operator who they are speaking with.
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

  // ── 5(a) Input tagger surface (Claim 5) — public-chat ────────────────────
  // Stub returns null today; Phase 4 will populate. When non-null the [SAFETY]
  // annotation rides as part of the system prompt so the operator's reasoning
  // loop sees it and decides how to respond in its own voice (never gated).
  const safetyContext = analyzeInputForSafety(message);
  if (safetyContext) {
    promptSections.push(
      `[SAFETY] ${safetyContext.risk} (confidence ${safetyContext.confidence.toFixed(2)}): ${safetyContext.rationale}`,
    );
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
  // Use default model (ensure DEFAULT_MODEL_ID supports vision)
  if (attachments && attachments.some((a) => a.type === 'image')) {
    model = DEFAULT_MODEL_ID;
  }

  // ── FULL UNIVERSAL TOOL SUBSTRATE (Claims 4 / 9 / 31 / 36 / D-4) ──
  // Slot deploys used to dispatch with `{ model }` only — silently capability-
  // stripped relative to the owner Hub. Per [[expand-never-cut]] the operator
  // now receives the FULL universal tool catalogue, filtered by the registry's
  // scope + availability rules (the only gate). Conversation ID is required
  // by tool handlers; for public scope we use the in-memory sessionId.
  const [pcSecretRows, pcIntegrationRows] = await Promise.all([
    db.select({ key: operatorSecretsTable.key }).from(operatorSecretsTable).where(eq(operatorSecretsTable.operatorId, slot.operatorId)),
    db.select({ type: operatorIntegrationsTable.integrationType }).from(operatorIntegrationsTable).where(eq(operatorIntegrationsTable.operatorId, slot.operatorId)),
  ]);
  const toolset = buildOperatorToolset({
    operatorId: slot.operatorId,
    ownerId: slot.ownerId,
    conversationId: scope.writesHistory ? (conv?.id ?? sessionId) : sessionId,
    scope,
    mandate: operator.mandate ?? '',
    liveSecrets: pcSecretRows.map(s => s.key),
    connectedIntegrations: pcIntegrationRows.map(i => i.type).filter((t): t is string => typeof t === 'string'),
  });

  // ── OPERATOR-AS-DRIVER (full TurnPlan, post-toolset so introspect can use tool names) ──
  // The operator composes its authoritative plan for this turn — intent,
  // scaffolding, constraints, mode (execute/chat/introspect). Passed into
  // runSyncAgentLoop so the LLM never sees a freeform "answer the user"
  // prompt — it sees the operator's intent + scaffolding as system context
  // and voices within those bounds. Patent claim 21 fully realised.
  const turnPlan = agent.composeTurnPlan(message, {
    toolNames: toolset.tools.map(t => t.function.name),
    toolDescriptions: new Map(toolset.tools.map(t => [t.function.name, t.function.description ?? ''])),
  });

  // ── STREAM PATH ────────────────────────────────────────────────────────────
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      // STEP 2 — Operator dispatches the LLM as streaming executor for this
      // turn. With the universal tool catalogue wired (Claims 4/9/31/36) the
      // operator may decide to use tools across multiple iterations; the
      // sync agent loop handles the iteration + dispatch then we emit the
      // final operator-voice content as a single SSE delta. Token-by-token
      // streaming inside the loop is owner-Hub only (chat.ts) — slot deploys
      // get tool capability + full-message delivery instead of per-token
      // delivery. Trade documented in Phase 1B SoT.
      const loopResult = await runSyncAgentLoop({
        agent,
        toolset,
        messages,
        model,
        analyseDecision: operatorDecision.kind,
        turnPlan,
      });
      const fullContent = loopResult.content;
      if (fullContent) {
        res.write(`data: ${JSON.stringify({ delta: fullContent })}\n\n`);
      }

      let finalContent = fullContent;

      if (scope.writesHistory && conv) {
        await db.insert(messagesTable).values({
          id: crypto.randomUUID(),
          conversationId: conv.id,
          operatorId: slot.operatorId,
          role: 'assistant',
          content: finalContent,
          model,
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

      // ── 5(b) Output leak-check surface (Claim 5) — public-chat stream ────
      // Stub returns null today; Phase 4 fills in. Always included on the
      // SSE done payload so the contract is stable when Phase 4 lights up.
      const streamLeakFeedback = analyzeOutputForLeak(finalContent, slot.operatorId);
      const responseConvId = scope.writesHistory ? conv!.id : sessionId;
      res.write(`data: ${JSON.stringify({
        done: true,
        conversationId: responseConvId,
        scopeId: scope.scopeId,
        leakFeedback: streamLeakFeedback,
      })}\n\n`);
      res.end();
    } catch (streamErr: unknown) {
      // Per [[no-fallbacks]] + Claim 13: NEVER substitute synthetic operator
      // voice when the LLM call fails. Emit a structured error event so the
      // SSE caller can render its own diagnostic per [[errors-as-investigation]].
      // Crucially: do NOT persist a fake `role:'assistant'` row to history —
      // the operator never said anything this turn, and writing a fake reply
      // would pollute Layer 1 + Layer 2 distillation downstream.
      console.error('[public-chat] streaming LLM error', streamErr);
      const streamStatus = (streamErr as { status?: number })?.status ?? null;
      const streamCode = (streamErr as { code?: string })?.code ?? null;
      const streamRawMessage = (streamErr as { message?: string })?.message ?? null;
      res.write(`data: ${JSON.stringify({
        error: 'llm_invocation_failed',
        upstreamStatus: streamStatus,
        upstreamCode: streamCode,
        upstreamMessage: streamRawMessage,
        operatorId: slot.operatorId,
        scopeId: scope.scopeId,
      })}\n\n`);
      res.end();
    }

  // ── SYNC PATH ──────────────────────────────────────────────────────────────
  } else {
    let loopResult;
    try {
      // STEP 2 — Operator dispatches the LLM via the shared sync agent loop,
      // which exposes the FULL universal tool catalogue (Claims 4/9/31/36).
      loopResult = await runSyncAgentLoop({
        agent,
        toolset,
        messages,
        model,
        analyseDecision: operatorDecision.kind,
        turnPlan,
      });
    } catch (llmErr: unknown) {
      // Per [[no-fallbacks]] + Claim 13: never substitute synthetic operator
      // voice on LLM failure. Propagate the real upstream error so the caller
      // can decide (per [[errors-as-investigation]]). Status: 502 unless
      // upstream explicitly returned 402 (payment required) — then 503 so
      // the caller can tell auth-failure apart from generic provider error.
      console.error('[public-chat] sync LLM error', llmErr);
      const status = (llmErr as { status?: number })?.status ?? null;
      const code = (llmErr as { code?: string })?.code ?? null;
      const rawMessage = (llmErr as { message?: string })?.message ?? null;
      const httpStatus = status === 402 ? 503 : 502;
      res.status(httpStatus).json({
        error: 'llm_invocation_failed',
        upstreamStatus: status,
        upstreamCode: code,
        upstreamMessage: rawMessage,
        operatorId: slot.operatorId,
        scopeId: scope.scopeId,
      });
      return;
    }

    const finalContent = loopResult.content;

    if (scope.writesHistory && conv) {
      await db.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId: conv.id,
        operatorId: slot.operatorId,
        role: 'assistant',
        content: finalContent,
        model,
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

    // ── 5(b) Output leak-check surface (Claim 5) — public-chat sync ───────
    const syncLeakFeedback = analyzeOutputForLeak(finalContent, slot.operatorId);
    const responseConvId = scope.writesHistory ? conv!.id : sessionId;
    res.json({
      conversationId: responseConvId,
      message: { role: 'assistant', content: finalContent },
      scopeId: scope.scopeId,
      leakFeedback: syncLeakFeedback,
    });
  }
});

export default router;
