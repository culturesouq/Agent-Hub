import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import {
  operatorsTable,
  conversationsTable,
  messagesTable,
  platformSkillsTable,
  operatorSkillsTable,
} from '@workspace/db';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';
import { chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import type { ActiveSkill } from '../utils/systemPrompt.js';
import { validateEntry, runDiscoverySweep } from '../utils/vaelEngine.js';
import { runVaelFullSweep, runVaelValidationOnly, getVaelRunState } from '../cron/vaelCron.js';
import { randomUUID } from 'crypto';

const router = Router();
router.use(requireAuth);

const VAEL_SLUG = 'vael';

async function getVael() {
  const [vael] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.slug, VAEL_SLUG))
    .limit(1);
  return vael ?? null;
}

async function getVaelSkills(vaelId: string): Promise<ActiveSkill[]> {
  const rows = await db
    .select({
      name: platformSkillsTable.name,
      instructions: platformSkillsTable.instructions,
      customInstructions: operatorSkillsTable.customInstructions,
      outputFormat: platformSkillsTable.outputFormat,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(
      and(
        eq(operatorSkillsTable.operatorId, vaelId),
        eq(operatorSkillsTable.isActive, true),
      ),
    );

  return rows.map(r => ({
    name: r.name,
    instructions: r.instructions,
    customInstructions: r.customInstructions ?? null,
    outputFormat: r.outputFormat ?? null,
  }));
}

async function getOrCreateConversation(vaelId: string, ownerId: string): Promise<string> {
  const [existing] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.operatorId, vaelId),
        eq(conversationsTable.ownerId, ownerId),
        eq(conversationsTable.scopeType, 'owner'),
      ),
    )
    .orderBy(desc(conversationsTable.createdAt))
    .limit(1);

  if (existing) return existing.id;

  const id = randomUUID();
  await db.insert(conversationsTable).values({
    id,
    operatorId: vaelId,
    ownerId,
    contextName: 'Vael — direct channel',
    scopeId: ownerId,
    scopeType: 'owner',
    messageCount: 0,
    createdAt: new Date(),
  });
  return id;
}

// ── GET /api/vael/status ─────────────────────────────────────────────────────

router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  const vael = await getVael();
  if (!vael) {
    res.status(404).json({ error: 'Vael not found — run seedVael first' });
    return;
  }
  res.json({
    id: vael.id,
    name: vael.name,
    slug: vael.slug,
    archetype: vael.archetype,
    mandate: vael.mandate,
    growLockLevel: vael.growLockLevel,
    layer1LockedAt: vael.layer1LockedAt,
    ready: true,
  });
});

// ── GET /api/vael/history ────────────────────────────────────────────────────

router.get('/history', async (req: Request, res: Response): Promise<void> => {
  const vael = await getVael();
  if (!vael) { res.status(404).json({ error: 'Vael not found' }); return; }

  const ownerId = req.owner!.ownerId;
  const convId = await getOrCreateConversation(vael.id, ownerId);

  const messages = await db
    .select({
      id: messagesTable.id,
      role: messagesTable.role,
      content: messagesTable.content,
      createdAt: messagesTable.createdAt,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, convId),
        eq(messagesTable.isInternal, false),
      ),
    )
    .orderBy(asc(messagesTable.createdAt))
    .limit(100);

  res.json({ conversationId: convId, messages });
});

// ── POST /api/vael/chat ──────────────────────────────────────────────────────

router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const { message } = req.body as { message?: string };

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const vael = await getVael();
  if (!vael) { res.status(404).json({ error: 'Vael not found' }); return; }

  const ownerId = req.owner!.ownerId;
  const convId = await getOrCreateConversation(vael.id, ownerId);
  const skills = await getVaelSkills(vael.id);

  const systemPrompt = buildSystemPrompt(
    {
      name: vael.name,
      archetype: (vael.archetype ?? []) as string[],
      rawIdentity: vael.rawIdentity,
      mandate: vael.mandate ?? '',
      coreValues: vael.coreValues as string[] | null,
      ethicalBoundaries: vael.ethicalBoundaries as string[] | null,
      layer2Soul: (vael.layer2Soul ?? {}) as any,
    },
    undefined,
    skills,
    undefined,
    undefined,
    { scopeLine: 'Caller: platform owner — direct channel' },
  );

  const existingMessages = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, convId),
        eq(messagesTable.isInternal, false),
      ),
    )
    .orderBy(asc(messagesTable.createdAt))
    .limit(40);

  const history = existingMessages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const userMsgId = randomUUID();
  await db.insert(messagesTable).values({
    id: userMsgId,
    conversationId: convId,
    operatorId: vael.id,
    role: 'user',
    content: message,
    isInternal: false,
    createdAt: new Date(),
  });

  let reply: string;
  try {
    const response = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
      { model: CHAT_MODEL },
    );
    reply = response.content;
  } catch (e) {
    await db.delete(messagesTable).where(eq(messagesTable.id, userMsgId));
    res.status(500).json({ error: 'Chat completion failed', detail: (e as Error).message });
    return;
  }

  await db.insert(messagesTable).values({
    id: randomUUID(),
    conversationId: convId,
    operatorId: vael.id,
    role: 'assistant',
    content: reply,
    isInternal: false,
    createdAt: new Date(),
  });

  await db
    .update(conversationsTable)
    .set({
      messageCount: sql`${conversationsTable.messageCount} + 2`,
      lastMessageAt: new Date(),
    })
    .where(eq(conversationsTable.id, convId));

  res.json({
    conversationId: convId,
    reply,
    model: CHAT_MODEL,
  });
});

// ── POST /api/vael/validate ──────────────────────────────────────────────────

router.post('/validate', async (req: Request, res: Response): Promise<void> => {
  const { title, content, layer, archetype, tags, sourceName, confidence } = req.body as {
    title: string;
    content: string;
    layer: string;
    archetype?: string;
    tags?: string[];
    sourceName?: string;
    confidence?: number;
  };

  if (!title || !content || !layer) {
    res.status(400).json({ error: 'title, content, and layer are required' });
    return;
  }

  try {
    const result = await validateEntry({ title, content, layer, archetype, tags: tags ?? [], sourceName, confidence });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Validation failed', detail: (e as Error).message });
  }
});

// ── POST /api/vael/discover ──────────────────────────────────────────────────

router.post('/discover', async (req: Request, res: Response): Promise<void> => {
  const { focus } = req.body as { focus?: string };

  try {
    const result = await runDiscoverySweep(focus);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Discovery sweep failed', detail: (e as Error).message });
  }
});

// ── GET /api/vael/schedule ───────────────────────────────────────────────────

router.get('/schedule', (_req: Request, res: Response): void => {
  res.json(getVaelRunState());
});

// ── POST /api/vael/sweep ─────────────────────────────────────────────────────
// Manually trigger a full sweep (validate + discover + seed) without waiting for cron

router.post('/sweep', async (_req: Request, res: Response): Promise<void> => {
  res.json({ ok: true, message: 'Full sweep started — check server logs for progress' });
  runVaelFullSweep().catch((err) => {
    console.error('[VAEL] Manual full sweep error:', err);
  });
});

// ── POST /api/vael/sweep/validate ────────────────────────────────────────────
// Manually trigger validation-only cycle

router.post('/sweep/validate', async (_req: Request, res: Response): Promise<void> => {
  res.json({ ok: true, message: 'Validation cycle started — check server logs for progress' });
  runVaelValidationOnly().catch((err) => {
    console.error('[VAEL] Manual validation error:', err);
  });
});

export default router;
