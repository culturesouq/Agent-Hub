import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db';
import { operatorIntegrationsTable, operatorsTable, conversationsTable, messagesTable, operatorSecretsTable } from '@workspace/db';
import { decryptToken } from '@workspace/opsoul-utils/crypto';
import { CHAT_MODEL } from '../utils/openrouter.js';
import { assembleOperatorPrompt } from '../utils/systemPrompt.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { searchMemory, buildMemoryContext } from '../utils/memoryEngine.js';
import { buildChannelScope, buildScopeContext } from '../utils/scopeResolver.js';
import { OperatorAgent } from '../utils/operatorAgent.js';
import { buildOperatorToolset } from '../utils/operatorToolset.js';
import { analyzeInputForSafety, analyzeOutputForLeak } from '../utils/operatorFirewall.js';
import { runSyncAgentLoop } from '../utils/operatorAgentLoop.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import OpenAI, { toFile } from 'openai';
import { embed } from '@workspace/opsoul-utils/ai';
import type { ChatMessage } from '../utils/openrouter.js';

const router = Router();

async function downloadTelegramFile(
  botToken: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const fileRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const fileData = await fileRes.json() as { ok: boolean; result?: { file_path: string } };
  if (!fileData.ok || !fileData.result) throw new Error('Telegram getFile failed');
  const filePath = fileData.result.file_path;
  const ext = filePath.split('.').pop() ?? 'oga';
  const mimeType = ext === 'mp4' ? 'audio/mp4' : ext === 'ogg' || ext === 'oga' ? 'audio/ogg' : 'audio/webm';
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const contentRes = await fetch(fileUrl);
  const buf = await contentRes.arrayBuffer();
  return { buffer: Buffer.from(buf), mimeType, fileName: `voice.${ext}` };
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function resolveOrCreateConversation(
  operatorId: string,
  ownerId: string,
  scopeId: string,
  scopeType: string,
  contextName: string,
): Promise<typeof conversationsTable.$inferSelect> {
  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.operatorId, operatorId),
        eq(conversationsTable.scopeId, scopeId),
      ),
    );
  if (existing) return existing;

  try {
    const [created] = await db
      .insert(conversationsTable)
      .values({
        id: crypto.randomUUID(),
        operatorId,
        ownerId,
        contextName,
        scopeId,
        scopeType,
        messageCount: 0,
      })
      .returning();
    if (created) return created;
  } catch {
    // Race: another request created the row concurrently — fall through to re-select
  }

  const [raced] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.operatorId, operatorId),
        eq(conversationsTable.scopeId, scopeId),
      ),
    );
  return raced;
}

async function buildConvHistory(convId: string): Promise<ChatMessage[]> {
  const msgs = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(asc(messagesTable.createdAt));

  return msgs.filter((m) => {
    // Drop diagnostic rows (system_error) — they carry no operator voice and
    // must not leak into the next turn's history per [[no-fallbacks]].
    if (m.role !== 'user' && m.role !== 'assistant') return false;
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trimStart().startsWith('Human:')) {
      return false;
    }
    return true;
  }) as ChatMessage[];
}

router.post('/:operatorId', async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };

  const [integration] = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.operatorId, operatorId),
        eq(operatorIntegrationsTable.integrationType, 'telegram'),
      ),
    );
  if (!integration?.tokenEncrypted) {
    res.sendStatus(200);
    return;
  }

  const appSchema = integration.appSchema as Record<string, unknown> | null;
  const storedSecret = typeof appSchema?.webhookSecretToken === 'string' ? appSchema.webhookSecretToken : null;
  if (!storedSecret) {
    console.warn(`[telegram-webhook] no webhookSecretToken configured for operator ${operatorId} — rejecting`);
    res.sendStatus(403);
    return;
  }

  const incoming = req.headers['x-telegram-bot-api-secret-token'];
  if (incoming !== storedSecret) {
    console.warn(`[telegram-webhook] secret token mismatch for operator ${operatorId}`);
    res.sendStatus(403);
    return;
  }

  res.sendStatus(200);

  const update = req.body as Record<string, unknown>;
  const message = (update.message ?? update.edited_message) as Record<string, unknown> | undefined;
  if (!message) return;

  const chatId = message.chat && typeof (message.chat as Record<string, unknown>).id === 'number'
    ? (message.chat as Record<string, unknown>).id as number
    : null;
  if (!chatId) return;

  const botToken = decryptToken(integration.tokenEncrypted);

  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.id, operatorId));
  if (!operator) return;

  let userMessage = '';

  if (typeof message.text === 'string') {
    userMessage = message.text;
  } else if (message.voice) {
    const voice = message.voice as Record<string, unknown>;
    const fileId = voice.file_id as string;
    try {
      const { buffer, mimeType, fileName } = await downloadTelegramFile(botToken, fileId);
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const file = await toFile(buffer, fileName, { type: mimeType });
      const transcript = await openai.audio.transcriptions.create({ model: 'whisper-1', file });
      userMessage = transcript.text;
    } catch (err: unknown) {
      // Per [[no-fallbacks]]: avoid synthetic operator-voice substitution
      // even on transcription failure. Frame as out-of-band delivery
      // diagnostic so the user knows the voice did not reach the operator,
      // without putting fake words in the operator's mouth.
      console.error('[telegram-webhook] transcription error', err);
      const rawMessage = (err as { message?: string })?.message ?? null;
      await sendTelegramMessage(
        botToken,
        chatId,
        `[Voice transcription failed${rawMessage ? `: ${rawMessage}` : ''}. The operator did not receive the voice message; please retry or send text.]`,
      ).catch((sendErr) => console.error('[telegram-webhook] failed to deliver transcription diagnostic', sendErr));
      return;
    }
  } else if (message.photo) {
    const caption = typeof message.caption === 'string' ? message.caption : '';
    userMessage = caption || '[User sent a photo]';
  } else if (message.document) {
    const doc = message.document as Record<string, unknown>;
    const caption = typeof message.caption === 'string' ? message.caption : '';
    userMessage = caption || `[User sent a document: ${typeof doc.file_name === 'string' ? doc.file_name : 'file'}]`;
  } else {
    return;
  }

  if (!userMessage.trim()) return;

  const scope = buildChannelScope('telegram', chatId.toString());
  const conv = await resolveOrCreateConversation(
    operatorId,
    operator.ownerId,
    scope.scopeId,
    scope.scopeType,
    `telegram:${chatId}`,
  );

  await db.insert(messagesTable).values({
    id: crypto.randomUUID(),
    operatorId,
    conversationId: conv.id,
    role: 'user',
    content: userMessage,
  });

  // ── OPERATOR-IN-CONTROL ───────────────────────────────────────────────
  // STEP 1 — Operator analyses the inbound Telegram message BEFORE any LLM
  // is called. Channel callers are not in birth mode. If the operator
  // decides to refuse (architecture-introspection), it answers in its own
  // voice via Telegram, no LLM call.
  const agent = new OperatorAgent({
    operatorId: operator.id,
    operatorName: operator.name,
    isBirthMode: false,
    scopeType: scope.scopeType,
  });

  const decision = agent.analyse(userMessage);
  void decision; // tool gating in this webhook is handled at the executeSync layer; decision retained for future use

  try {
    const embedding = await embed(userMessage);
    const [hits, memHits] = await Promise.all([
      searchBothKbs(operator.id, embedding, 5, 30, operator.archetype, operator.domainTags ?? []),
      searchMemory(operator.id, embedding, 5, 0.7, 0.3, scope.scopeId),
    ]);

    const ragCtx = buildRagContext(hits);
    const memCtx = buildMemoryContext(memHits);

    // KB hits + memory hits woven into system prompt unlabeled per § 3 rule 10
    // + § 4 architecture-as-secret. No more [KNOWLEDGE] / [MEMORY] labels in
    // the operator's prompt — operator carries them as absorbed knowledge.
    // Scope context: tell the operator which channel they are on, who the
    // caller is, and which conversation reference applies. Caller identifier
    // is the Telegram chat_id — server-trusted via webhook secret.
    const scopeLine = buildScopeContext({
      scope,
      conversationId: conv.id,
    });
    const promptSections: string[] = [
      assembleOperatorPrompt(operator, null, { scopeLine }),
    ];
    if (ragCtx) promptSections.push(ragCtx);
    if (memCtx) promptSections.push(memCtx);

    // ── 5(a) Input tagger surface (Claim 5) — telegram channel ────────────
    // Stub returns null today; Phase 4 will populate.
    const safetyContext = analyzeInputForSafety(userMessage);
    if (safetyContext) {
      promptSections.push(
        `[SAFETY] ${safetyContext.risk} (confidence ${safetyContext.confidence.toFixed(2)}): ${safetyContext.rationale}`,
      );
    }

    const history = await buildConvHistory(conv.id);

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: promptSections.join('\n\n') },
      ...history,
    ];

    const model = (operator.defaultModel && operator.defaultModel !== 'opsoul/auto')
      ? operator.defaultModel
      : CHAT_MODEL;

    // ── FULL UNIVERSAL TOOL SUBSTRATE (Claims 4 / 9 / 31 / 36 / D-4) ──
    // Channel surfaces (Telegram, WhatsApp) used to dispatch with `{ model }`
    // only — silently capability-stripped. Per [[expand-never-cut]] the
    // operator now receives the FULL universal tool catalogue here, filtered
    // by the registry's scope + availability rules (the only gate). Load
    // the operator's stored secret labels + connected integrations so
    // http_request can interpolate {{secret-label}} placeholders and
    // integration-availability tools resolve correctly.
    const [secretRows, integrationRows] = await Promise.all([
      db.select({ key: operatorSecretsTable.key }).from(operatorSecretsTable).where(eq(operatorSecretsTable.operatorId, operator.id)),
      db.select({ type: operatorIntegrationsTable.integrationType }).from(operatorIntegrationsTable).where(eq(operatorIntegrationsTable.operatorId, operator.id)),
    ]);
    const toolset = buildOperatorToolset({
      operatorId: operator.id,
      ownerId: operator.ownerId,
      conversationId: conv.id,
      scope,
      mandate: operator.mandate ?? '',
      liveSecrets: secretRows.map(s => s.key),
      connectedIntegrations: integrationRows.map(i => i.type).filter((t): t is string => typeof t === 'string'),
    });

    // STEP 2 — Operator dispatches the LLM as its executor for this turn.
    // The operator owns the call (it chose the model, built the messages,
    // assembled the system prompt with its identity + scope context).
    // The LLM produces text in the operator's voice via the shared sync
    // agent loop, which handles tool calls if the operator decides to use
    // them (up to MAX_ITER iterations, MAX_SEARCHES web searches).
    const loopResult = await runSyncAgentLoop({
      agent,
      toolset,
      messages: chatMessages,
      model,
    });
    const finalContent = loopResult.content;

    // ── 5(b) Output leak-check surface (Claim 5) — telegram channel ───────
    // Stub returns null today; Phase 4 fills in. When non-null, the feedback
    // is logged for owner-side review; per [[no-fallbacks]] we never mutate
    // the operator's reply. Telegram is a one-way channel so the user sees
    // exactly what the operator wrote.
    const leakFeedback = analyzeOutputForLeak(finalContent, operator.id);
    if (leakFeedback) {
      console.warn(`[telegram-webhook] leak feedback for operator=${operator.id}: ${leakFeedback.kind} — ${leakFeedback.suggestion}`);
    }

    await db.insert(messagesTable).values({
      id: crypto.randomUUID(),
      operatorId,
      conversationId: conv.id,
      role: 'assistant',
      content: finalContent,
      model,
    });

    await db
      .update(conversationsTable)
      .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, conv.id));

    await sendTelegramMessage(botToken, chatId, finalContent);
  } catch (err: unknown) {
    // Per [[no-fallbacks]] + Claim 13: never substitute synthetic operator
    // voice on LLM failure, and NEVER persist a fake reply as
    // `role:'assistant'` (that fake voice would feed Layer 1 + Layer 2
    // distillation and pollute the operator's memory forever). Telegram is
    // a one-way channel, so the user must see something — we send an
    // out-of-band diagnostic clearly framed as a delivery error, not the
    // operator's voice. The diagnostic is persisted with role 'system_error'
    // so history readers (and memory distillers) can identify and skip it.
    console.error('[telegram-webhook] reply error', err);
    const status = (err as { status?: number })?.status ?? null;
    const code = (err as { code?: string })?.code ?? null;
    const rawMessage = (err as { message?: string })?.message ?? null;
    const diagnostic = `[Delivery error — your message reached the operator but the reply could not be produced. Upstream status: ${status ?? 'unknown'}${code ? ` / ${code}` : ''}.]`;
    try {
      await sendTelegramMessage(botToken, chatId, diagnostic);
    } catch (sendErr) {
      console.error('[telegram-webhook] failed to deliver diagnostic', sendErr);
    }
    try {
      await db.insert(messagesTable).values({
        id: crypto.randomUUID(),
        operatorId,
        conversationId: conv.id,
        role: 'system_error',
        content: JSON.stringify({
          error: 'llm_invocation_failed',
          upstreamStatus: status,
          upstreamCode: code,
          upstreamMessage: rawMessage,
          deliveredDiagnostic: diagnostic,
        }),
      });
      await db
        .update(conversationsTable)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conv.id));
    } catch {
      // best-effort — diagnostic logging only
    }
  }
});

export default router;
