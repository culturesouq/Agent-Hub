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

router.post('/:operatorId', async (req: Request, res: Response): Promise<void> => {
  res.sendStatus(200);

  const { operatorId } = req.params;
  const update = req.body as Record<string, unknown>;
  const message = (update.message ?? update.edited_message) as Record<string, unknown> | undefined;
  if (!message) return;

  const chatId = message.chat && typeof (message.chat as Record<string, unknown>).id === 'number'
    ? (message.chat as Record<string, unknown>).id as number
    : null;
  if (!chatId) return;

  const [integration] = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.operatorId, operatorId),
        eq(operatorIntegrationsTable.integrationType, 'telegram'),
      ),
    );
  if (!integration?.tokenEncrypted) return;

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
      console.error('[telegram-webhook] transcription error', err);
      await sendTelegramMessage(botToken, chatId, 'Sorry, I could not transcribe your voice message.');
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

  try {
    const embedding = await embed(userMessage);
    const [hits, memHits] = await Promise.all([
      searchBothKbs(operator.id, embedding, 5, 0.5, operator.archetype, operator.domainTags ?? []),
      searchMemory(operator.id, embedding, 5, 0.7, 0.3),
    ]);

    const ragCtx = buildRagContext(hits);
    const memCtx = buildMemoryContext(memHits);

    let scopeLine = '[CHANNEL: Telegram]';
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
    await sendTelegramMessage(botToken, chatId, result.content);
  } catch (err: unknown) {
    console.error('[telegram-webhook] reply error', err);
    await sendTelegramMessage(botToken, chatId, 'Sorry, I encountered an error. Please try again.');
  }
});

export default router;
