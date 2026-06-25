import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db';
import { operatorIntegrationsTable, operatorsTable, conversationsTable, messagesTable, operatorSecretsTable } from '@workspace/db';
import { decryptToken } from '@workspace/opsoul-utils/crypto';
import { CHAT_MODEL } from '../utils/bedrock.js';
import { assembleOperatorPrompt } from '../utils/systemPrompt.js';
import { buildChannelScope, buildScopeContext } from '../utils/scopeResolver.js';
import { OperatorAgent } from '../utils/operatorAgent.js';
import { buildOperatorToolset } from '../utils/operatorToolset.js';
import { analyzeInputForSafety, analyzeOutputForLeak } from '../utils/operatorFirewall.js';
import { runSyncAgentLoop } from '../utils/operatorAgentLoop.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import type { ChatMessage } from '../utils/bedrock.js';

type RequestWithRawBody = Request & { rawBody?: Buffer };

const router = Router();

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'opsoul_verify_2026';

async function sendWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  text: string,
): Promise<void> {
  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
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

router.get('/:operatorId', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/:operatorId', async (req: RequestWithRawBody, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };

  const [integration] = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.operatorId, operatorId),
        eq(operatorIntegrationsTable.integrationType, 'whatsapp'),
      ),
    );
  if (!integration?.tokenEncrypted) {
    res.sendStatus(200);
    return;
  }

  const appSchema = integration.appSchema as Record<string, unknown> | null;
  let appSecret: string | null = null;
  if (integration.refreshTokenEncrypted) {
    try {
      appSecret = decryptToken(integration.refreshTokenEncrypted);
    } catch {
      console.error(`[whatsapp-webhook] failed to decrypt appSecret for operator ${operatorId}`);
    }
  }
  if (!appSecret) {
    console.warn(`[whatsapp-webhook] no appSecret configured for operator ${operatorId} — rejecting`);
    res.sendStatus(403);
    return;
  }

  const sigHeader = req.headers['x-hub-signature-256'];
  if (typeof sigHeader !== 'string' || !sigHeader.startsWith('sha256=')) {
    console.warn(`[whatsapp-webhook] missing HMAC signature for operator ${operatorId}`);
    res.sendStatus(403);
    return;
  }
  const rawBody = req.rawBody;
  if (!rawBody) {
    console.warn(`[whatsapp-webhook] raw body unavailable for HMAC check on operator ${operatorId}`);
    res.sendStatus(400);
    return;
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(sigHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn(`[whatsapp-webhook] HMAC mismatch for operator ${operatorId}`);
    res.sendStatus(403);
    return;
  }

  res.sendStatus(200);

  const body = req.body as Record<string, unknown>;

  const entry = Array.isArray(body.entry) ? body.entry[0] as Record<string, unknown> : null;
  if (!entry) return;
  const changes = Array.isArray(entry.changes) ? entry.changes[0] as Record<string, unknown> : null;
  if (!changes) return;
  const value = changes.value as Record<string, unknown> | undefined;
  if (!value) return;

  const messages = Array.isArray(value.messages) ? value.messages : null;
  if (!messages || messages.length === 0) return;

  const msg = messages[0] as Record<string, unknown>;
  const from = typeof msg.from === 'string' ? msg.from : null;
  if (!from) return;

  const accessToken = decryptToken(integration.tokenEncrypted);

  const phoneNumberId = typeof appSchema?.phoneNumberId === 'string' ? appSchema.phoneNumberId : null;
  if (!phoneNumberId) {
    console.error('[whatsapp-webhook] phoneNumberId missing from appSchema for operator', operatorId);
    return;
  }

  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.id, operatorId));
  if (!operator) return;

  let userMessage = '';
  const msgType = typeof msg.type === 'string' ? msg.type : '';

  if (msgType === 'text') {
    const textObj = msg.text as Record<string, unknown> | undefined;
    userMessage = typeof textObj?.body === 'string' ? textObj.body : '';
  } else if (msgType === 'audio') {
    // Voice transcription not available (no Whisper on Azure). Tell user to send text.
    await sendWhatsAppMessage(accessToken, phoneNumberId, from, 'Please send a text message — voice is not supported yet.').catch(() => {});
    return;
  } else if (msgType === 'image') {
    const imageObj = msg.image as Record<string, unknown> | undefined;
    const caption = typeof imageObj?.caption === 'string' ? imageObj.caption : '';
    userMessage = caption || '[User sent an image]';
  } else if (msgType === 'document') {
    const docObj = msg.document as Record<string, unknown> | undefined;
    const caption = typeof docObj?.caption === 'string' ? docObj.caption : '';
    const filename = typeof docObj?.filename === 'string' ? docObj.filename : 'file';
    userMessage = caption || `[User sent a document: ${filename}]`;
  } else {
    return;
  }

  if (!userMessage.trim()) return;

  const scope = buildChannelScope('whatsapp', from);
  const conv = await resolveOrCreateConversation(
    operatorId,
    operator.ownerId,
    scope.scopeId,
    scope.scopeType,
    `whatsapp:${from}`,
  );

  await db.insert(messagesTable).values({
    id: crypto.randomUUID(),
    operatorId,
    conversationId: conv.id,
    role: 'user',
    content: userMessage,
  });

  // ── OPERATOR-IN-CONTROL ───────────────────────────────────────────────
  // STEP 1 — Operator analyses the inbound WhatsApp message BEFORE any
  // LLM is called. If the operator decides to refuse (architecture-
  // introspection), it answers in its own voice via WhatsApp, no LLM call.
  const agent = new OperatorAgent({
    operatorId: operator.id,
    operatorName: operator.name,
    isBirthMode: false,
    scopeType: scope.scopeType,
  });


  try {
    // KB and memory are retrievable by the operator on demand via tools (kb_search,
    // memory tools). They are NOT pre-injected here — system prompt is identity only.
    const scopeLine = buildScopeContext({ scope, conversationId: conv.id });
    const promptSections: string[] = [
      assembleOperatorPrompt(operator, null, { scopeLine }),
    ];

    // ── 5(a) Input tagger surface (Claim 5) — whatsapp channel ────────────
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

    // OPERATOR-AS-DRIVER (full TurnPlan) — compose AFTER toolset so introspect
    // can use real tool names from this scope.
    const turnPlan = agent.composeTurnPlan(userMessage, {
      toolNames: toolset.tools.map(t => t.function.name),
      toolDescriptions: new Map(toolset.tools.map(t => [t.function.name, t.function.description ?? ''])),
    });

    // STEP 2 — Operator dispatches the LLM as its executor for this turn.
    // The operator owns the call (intent + scaffolding via TurnPlan). The
    // LLM voices within the operator's plan — never freeform.
    const loopResult = await runSyncAgentLoop({
      agent,
      toolset,
      messages: chatMessages,
      model,
      turnPlan,
      analyseDecision: turnPlan.kind,
    });
    const finalContent = loopResult.content;

    // ── 5(b) Output leak-check surface (Claim 5) — whatsapp channel ───────
    // Stub returns null today; Phase 4 fills in. WhatsApp is one-way so we
    // log for owner-side review; never mutate the operator's reply.
    const leakFeedback = analyzeOutputForLeak(finalContent, operator.id);
    if (leakFeedback) {
      console.warn(`[whatsapp-webhook] leak feedback for operator=${operator.id}: ${leakFeedback.kind} — ${leakFeedback.suggestion}`);
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

    await sendWhatsAppMessage(accessToken, phoneNumberId, from, finalContent);
  } catch (err: unknown) {
    // Per [[no-fallbacks]] + Claim 13: never substitute synthetic operator
    // voice on LLM failure, and NEVER persist a fake reply as
    // `role:'assistant'` (that fake voice would feed Layer 1 + Layer 2
    // distillation and pollute the operator's memory forever). WhatsApp is
    // a one-way channel, so the user must see something — send an
    // out-of-band diagnostic clearly framed as a delivery error, not the
    // operator's voice. Diagnostic persisted with role 'system_error' so
    // memory distillers and history readers can identify and skip it.
    console.error('[whatsapp-webhook] reply error', err);
    const status = (err as { status?: number })?.status ?? null;
    const code = (err as { code?: string })?.code ?? null;
    const rawMessage = (err as { message?: string })?.message ?? null;
    const diagnostic = `[Delivery error — your message reached the operator but the reply could not be produced. Upstream status: ${status ?? 'unknown'}${code ? ` / ${code}` : ''}.]`;
    try {
      await sendWhatsAppMessage(accessToken, phoneNumberId, from, diagnostic);
    } catch (sendErr) {
      console.error('[whatsapp-webhook] failed to deliver diagnostic', sendErr);
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
