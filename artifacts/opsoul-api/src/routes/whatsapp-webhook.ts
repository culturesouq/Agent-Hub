import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db';
import { operatorIntegrationsTable, operatorsTable, conversationsTable, messagesTable } from '@workspace/db';
import { decryptToken } from '@workspace/opsoul-utils/crypto';
import { chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { assembleOperatorPrompt } from '../utils/systemPrompt.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { searchMemory, buildMemoryContext } from '../utils/memoryEngine.js';
import { buildChannelScope, buildScopeContext } from '../utils/scopeResolver.js';
import { OperatorAgent } from '../utils/operatorAgent.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import OpenAI, { toFile } from 'openai';
import { embed } from '@workspace/opsoul-utils/ai';
import type { ChatMessage } from '../utils/openrouter.js';

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

async function downloadWhatsAppMedia(
  accessToken: string,
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meta = await metaRes.json() as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error('WhatsApp media URL not found');
  const contentRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const buf = await contentRes.arrayBuffer();
  return { buffer: Buffer.from(buf), mimeType: meta.mime_type ?? 'audio/ogg' };
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
    const audioObj = msg.audio as Record<string, unknown> | undefined;
    const mediaId = typeof audioObj?.id === 'string' ? audioObj.id : null;
    if (!mediaId) return;
    try {
      const { buffer, mimeType } = await downloadWhatsAppMedia(accessToken, mediaId);
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const file = await toFile(buffer, `voice.${ext}`, { type: mimeType });
      const transcript = await openai.audio.transcriptions.create({ model: 'whisper-1', file });
      userMessage = transcript.text;
    } catch (err: unknown) {
      console.error('[whatsapp-webhook] transcription error', err);
      await sendWhatsAppMessage(accessToken, phoneNumberId, from, 'Sorry, I could not transcribe your voice message.');
      return;
    }
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

  const decision = agent.analyse(userMessage);
  if (decision.kind === 'refuse_architecture') {
    const refusalText = agent.composeArchitectureRefusal();
    console.warn('[operator:refuse]', JSON.stringify({
      path: 'whatsapp-webhook',
      operatorId,
      conversationId: conv.id,
      reason: 'architecture_introspection',
      message: userMessage.slice(0, 200),
    }));
    await db.insert(messagesTable).values({
      id: crypto.randomUUID(),
      operatorId,
      conversationId: conv.id,
      role: 'assistant',
      content: refusalText,
      model: 'operator-direct',
    });
    await sendWhatsAppMessage(accessToken, phoneNumberId, from, refusalText);
    return;
  }

  try {
    const embedding = await embed(userMessage);
    const [hits, memHits] = await Promise.all([
      searchBothKbs(operator.id, embedding, 5, 0.5, operator.archetype, operator.domainTags ?? []),
      searchMemory(operator.id, embedding, 5, 0.7, 0.3, scope.scopeId),
    ]);

    const ragCtx = buildRagContext(hits);
    const memCtx = buildMemoryContext(memHits);

    // KB hits + memory hits woven into system prompt unlabeled per § 3 rule 10
    // + § 4 architecture-as-secret. No more [KNOWLEDGE] / [MEMORY] labels in
    // the operator's prompt — operator carries them as absorbed knowledge.
    // Scope context: tell the operator which channel they are on, who the
    // caller is (phone number, server-trusted from webhook), and which
    // conversation reference applies.
    const scopeLine = buildScopeContext({
      scope,
      conversationId: conv.id,
    });
    const promptSections: string[] = [
      assembleOperatorPrompt(operator, null, { scopeLine }),
    ];
    if (ragCtx) promptSections.push(ragCtx);
    if (memCtx) promptSections.push(memCtx);

    const history = await buildConvHistory(conv.id);

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: promptSections.join('\n\n') },
      ...history,
    ];

    const model = (operator.defaultModel && operator.defaultModel !== 'opsoul/auto')
      ? operator.defaultModel
      : CHAT_MODEL;

    const result = await chatCompletion(chatMessages, model);

    // STEP 3 — Operator validates the LLM's draft before delivery.
    const validation = agent.validate(result.content);
    if (validation.triggers.length > 0) {
      console.warn('[operator:validate]', JSON.stringify({
        path: 'whatsapp-webhook',
        operatorId,
        scopeId: scope.scopeId,
        conversationId: conv.id,
        substituted: validation.substituted,
        triggers: validation.triggers,
      }));
    }
    const finalContent = validation.text;

    await db.insert(messagesTable).values({
      id: crypto.randomUUID(),
      operatorId,
      conversationId: conv.id,
      role: 'assistant',
      content: finalContent,
      model: validation.substituted ? 'operator-validate' : model,
    });

    await db
      .update(conversationsTable)
      .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, conv.id));

    await sendWhatsAppMessage(accessToken, phoneNumberId, from, finalContent);
  } catch (err: unknown) {
    console.error('[whatsapp-webhook] reply error', err);
    const errorReply = 'Sorry, I encountered an error. Please try again.';
    await sendWhatsAppMessage(accessToken, phoneNumberId, from, errorReply);
    try {
      await db.insert(messagesTable).values({
        id: crypto.randomUUID(),
        operatorId,
        conversationId: conv.id,
        role: 'assistant',
        content: errorReply,
      });
      await db
        .update(conversationsTable)
        .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conv.id));
    } catch {
      // best-effort
    }
  }
});

export default router;
