import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import { operatorIntegrationsTable, operatorsTable } from '@workspace/db';
import { decryptToken } from '@workspace/opsoul-utils/crypto';
import { chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { searchMemory, buildMemoryContext } from '../utils/memoryEngine.js';
import { eq, and } from 'drizzle-orm';
import OpenAI, { toFile } from 'openai';
import { embed } from '@workspace/opsoul-utils/ai';
import type { Layer2Soul } from '../validation/operator.js';
import type { ChatMessage } from '../utils/openrouter.js';

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

router.post('/:operatorId', async (req: Request, res: Response): Promise<void> => {
  res.sendStatus(200);

  const { operatorId } = req.params;
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

  const [integration] = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.operatorId, operatorId),
        eq(operatorIntegrationsTable.integrationType, 'whatsapp'),
      ),
    );
  if (!integration?.tokenEncrypted) return;

  const accessToken = decryptToken(integration.tokenEncrypted);

  const appSchema = integration.appSchema as Record<string, unknown> | null;
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

  try {
    const embedding = await embed(userMessage);
    const [hits, memHits] = await Promise.all([
      searchBothKbs(operator.id, embedding, 5, 0.5, operator.archetype, operator.domainTags ?? []),
      searchMemory(operator.id, embedding, 5, 0.7, 0.3),
    ]);

    const ragCtx = buildRagContext(hits);
    const memCtx = buildMemoryContext(memHits);

    let scopeLine = '[CHANNEL: WhatsApp]';
    if (ragCtx) scopeLine += `\n\n[KNOWLEDGE]\n${ragCtx}`;

    const systemPrompt = buildSystemPrompt(
      {
        name: operator.name,
        archetype: operator.archetype,
        rawIdentity: operator.rawIdentity,
        mandate: operator.mandate,
        coreValues: operator.coreValues,
        ethicalBoundaries: operator.ethicalBoundaries,
        layer2Soul: operator.layer2Soul as Layer2Soul,
      },
      null,
      { scopeLine },
    );

    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
    if (memCtx) messages.push({ role: 'system', content: `[MEMORY]\n${memCtx}` });
    messages.push({ role: 'user', content: userMessage });

    const model = (operator.defaultModel && operator.defaultModel !== 'opsoul/auto')
      ? operator.defaultModel
      : CHAT_MODEL;

    const result = await chatCompletion(messages, model);
    await sendWhatsAppMessage(accessToken, phoneNumberId, from, result.content);
  } catch (err: unknown) {
    console.error('[whatsapp-webhook] reply error', err);
    await sendWhatsAppMessage(accessToken, phoneNumberId, from, 'Sorry, I encountered an error. Please try again.');
  }
});

export default router;
