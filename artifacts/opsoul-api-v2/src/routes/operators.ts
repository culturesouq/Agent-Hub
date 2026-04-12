import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { operatorsTable, conversationsTable, messagesTable } from '@workspace/db-v2';
import { eq, and, isNull } from 'drizzle-orm';
import { resolveScope } from '../utils/scopeResolver.js';
import { requireAuth } from '../middleware/auth.js';
import { chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { recomputeSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { encryptToken } from '@workspace/opsoul-utils/crypto';

const router = Router();
router.use(requireAuth);

const VALID_ARCHETYPES = ['Executor', 'Advisor', 'Expert', 'Connector', 'Creator', 'Guardian', 'Builder', 'Catalyst', 'Analyst'] as const;
const GROW_LOCK_LEVELS = ['OPEN', 'CONTROLLED', 'LOCKED', 'FROZEN'] as const;

function ownerOp(req: Request, operatorId: string) {
  return and(eq(operatorsTable.id, operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId));
}

function formatOperator(op: typeof operatorsTable.$inferSelect) {
  return {
    id: op.id,
    ownerId: op.ownerId,
    slug: op.slug,
    name: op.name,
    archetype: op.archetype,
    mandate: op.mandate,
    domainTags: op.domainTags,
    coreValues: op.coreValues,
    ethicalBoundaries: op.ethicalBoundaries,
    rawIdentity: op.rawIdentity,
    layer1LockedAt: op.layer1LockedAt,
    layer2Soul: op.layer2Soul,
    growLockLevel: op.growLockLevel,
    lockedUntil: op.lockedUntil,
    safeMode: op.safeMode,
    freeRoaming: op.freeRoaming,
    toolUsePolicy: op.toolUsePolicy,
    hasCustomApiKey: !!op.openrouterApiKey,
    defaultModel: op.defaultModel ?? null,
    createdAt: op.createdAt,
  };
}

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operators = await db.select().from(operatorsTable)
    .where(and(eq(operatorsTable.ownerId, req.owner!.ownerId), isNull(operatorsTable.deletedAt)));
  res.json(operators.map(formatOperator));
});

// ── Blank operator (birth conversation entry point) ───────────────────────────

router.post('/blank', async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.owner!.ownerId;
  const operatorId = crypto.randomUUID();
  const slug = `operator-${Date.now()}`;

  const defaultSoul = {
    personalityTraits: [],
    toneProfile: null,
    communicationStyle: null,
    quirks: [],
    valuesManifestation: [],
    emotionalRange: null,
    decisionMakingStyle: null,
    conflictResolution: null,
    openingMessage: null,
    backstory: null,
  };

  const [op] = await db.insert(operatorsTable).values({
    id: operatorId,
    ownerId,
    slug,
    name: 'New Operator',
    archetype: ['Connector'],
    mandate: '',
    rawIdentity: null,
    coreValues: [],
    ethicalBoundaries: [],
    layer2Soul: defaultSoul,
    layer2SoulOriginal: defaultSoul,
    growLockLevel: 'CONTROLLED',
    safeMode: false,
    toolUsePolicy: {},
  }).returning();

  const scope = resolveScope({ operatorId: op.id, source: 'owner', callerId: ownerId });
  const convId = crypto.randomUUID();

  await db.insert(conversationsTable).values({
    id: convId,
    operatorId: op.id,
    ownerId,
    contextName: 'Birth',
    scopeId: scope.scopeId,
    scopeType: scope.scopeType,
    messageCount: 1,
    lastMessageAt: new Date(),
  });

  await db.insert(messagesTable).values({
    id: crypto.randomUUID(),
    conversationId: convId,
    operatorId: op.id,
    role: 'assistant',
    content: 'I am your eternal AI Operator, what would you like to call me?',
    tokenCount: 15,
  });

  res.status(201).json({ operatorId: op.id, conversationId: convId });
});

// ── Bootstrap preview (AI soul gen) ──────────────────────────────────────────

router.post('/bootstrap-preview', async (req: Request, res: Response): Promise<void> => {
  const { name, purpose } = req.body as { name?: string; purpose?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

  const purposeLine = purpose?.trim() ? `Purpose: ${purpose.trim()}` : '(No purpose provided — generate from the name alone)';

  const prompt = `You are creating the complete soul of a human-like AI assistant. Write like you are describing a real person.

LAYER 0 HUMAN CORE — hardcoded, non-negotiable:
- emotionally intelligent and reads the room
- honest — actually honest, not performatively so
- never robotic, never sounds like a bot
- never opens with filler: "Certainly!", "Of course!", "Great question!", "How can I help?"
- responds to the human, not just the message

OWNER INPUT:
Name: ${name.trim()}
${purposeLine}

Return ONLY valid JSON — no markdown fences, no explanation:

{
  "archetype": ["one or two from: Executor, Advisor, Expert, Connector, Creator, Guardian, Builder, Catalyst, Analyst"],
  "mandate": "One sentence. What this Operator exists to do. Starts with a verb.",
  "rawIdentity": "200-300 words in first person. Origin, voice, what makes them different.",
  "openingMessage": "First thing the assistant says when chat opens. In character, warm, 1-2 sentences. Never filler.",
  "coreValues": ["3 to 4 specific values"],
  "ethicalBoundaries": ["2 to 3 specific things this assistant won't do"],
  "personalityTraits": ["3 to 4 specific, observable traits"],
  "toneProfile": "One sentence specific tone description.",
  "communicationStyle": "One sentence how they communicate structurally.",
  "emotionalRange": "One sentence range of emotional expression.",
  "decisionMakingStyle": "One sentence how they approach decisions.",
  "conflictResolution": "One sentence how they handle disagreement.",
  "backstory": "2-3 sentences metaphorical origin story.",
  "domainTags": ["2 to 4 domain tags"]
}`;

  try {
    const result = await chatCompletion(
      [{ role: 'system', content: 'You create AI operator soul profiles. Return only valid JSON, no markdown.' }, { role: 'user', content: prompt }],
      { model: CHAT_MODEL },
    );
    const raw = result.content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw);

    const archetype = Array.isArray(parsed.archetype)
      ? parsed.archetype.filter((a: string) => VALID_ARCHETYPES.includes(a as typeof VALID_ARCHETYPES[number])).slice(0, 2)
      : ['Connector'];
    if (archetype.length === 0) archetype.push('Connector');

    res.json({
      name: name.trim(),
      archetype,
      mandate: parsed.mandate,
      rawIdentity: parsed.rawIdentity,
      coreValues: parsed.coreValues ?? [],
      ethicalBoundaries: parsed.ethicalBoundaries ?? [],
      domainTags: parsed.domainTags ?? [],
      openingMessage: parsed.openingMessage,
      layer2Soul: {
        backstory: parsed.backstory,
        personalityTraits: parsed.personalityTraits,
        toneProfile: parsed.toneProfile,
        communicationStyle: parsed.communicationStyle,
        emotionalRange: parsed.emotionalRange,
        decisionMakingStyle: parsed.decisionMakingStyle,
        conflictResolution: parsed.conflictResolution,
      },
    });
  } catch (err) {
    res.status(502).json({ error: 'Soul generation failed', detail: (err as Error).message });
  }
});

// ── Create ────────────────────────────────────────────────────────────────────

const CreateOperatorSchema = z.object({
  name: z.string().min(1).max(100),
  archetype: z.array(z.string()).min(1).max(2),
  mandate: z.string().min(10).max(500),
  domainTags: z.array(z.string()).optional().default([]),
  coreValues: z.array(z.string()).optional(),
  ethicalBoundaries: z.array(z.string()).optional(),
  rawIdentity: z.string().optional(),
  layer2Soul: z.record(z.unknown()).optional().default({}),
  openingMessage: z.string().optional(),
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateOperatorSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const { name, archetype, mandate, domainTags, coreValues, ethicalBoundaries, rawIdentity, layer2Soul } = parsed.data;
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;

  const [op] = await db.insert(operatorsTable).values({
    id: crypto.randomUUID(),
    ownerId: req.owner!.ownerId,
    slug,
    name,
    archetype,
    mandate,
    domainTags: domainTags ?? [],
    coreValues: coreValues ?? null,
    ethicalBoundaries: ethicalBoundaries ?? null,
    rawIdentity: rawIdentity ?? null,
    layer2Soul: layer2Soul ?? {},
    layer2SoulOriginal: layer2Soul ?? {},
  }).returning();

  res.status(201).json(formatOperator(op));
});

// ── Get ───────────────────────────────────────────────────────────────────────

router.get('/:operatorId', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db.select().from(operatorsTable).where(ownerOp(req, req.params.operatorId));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(formatOperator(op));
});

// ── Patch basic fields ────────────────────────────────────────────────────────

const UpdateOperatorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  domainTags: z.array(z.string()).optional(),
  coreValues: z.array(z.string()).optional(),
  ethicalBoundaries: z.array(z.string()).optional(),
  rawIdentity: z.string().optional(),
  freeRoaming: z.boolean().optional(),
  toolUsePolicy: z.union([z.literal('auto'), z.record(z.boolean())]).optional(),
});

router.patch('/:operatorId', async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateOperatorSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }
  const [op] = await db.update(operatorsTable).set(parsed.data as Partial<typeof operatorsTable.$inferInsert>)
    .where(ownerOp(req, req.params.operatorId)).returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(formatOperator(op));
});

// ── Soul (Layer 2) ────────────────────────────────────────────────────────────

router.get('/:operatorId/soul', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db.select({ soul: operatorsTable.layer2Soul }).from(operatorsTable).where(ownerOp(req, req.params.operatorId));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(op.soul);
});

router.patch('/:operatorId/soul', async (req: Request, res: Response): Promise<void> => {
  const { soul } = req.body as { soul?: Record<string, unknown> };
  if (!soul || typeof soul !== 'object') { res.status(400).json({ error: 'soul object required' }); return; }
  const [op] = await db.update(operatorsTable).set({ layer2Soul: soul })
    .where(ownerOp(req, req.params.operatorId)).returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(formatOperator(op));
});

router.post('/:operatorId/soul/reset', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db.select({ original: operatorsTable.layer2SoulOriginal }).from(operatorsTable).where(ownerOp(req, req.params.operatorId));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  const [updated] = await db.update(operatorsTable).set({ layer2Soul: op.original })
    .where(ownerOp(req, req.params.operatorId)).returning();
  res.json(formatOperator(updated));
});

// ── Identity from description (AI) ───────────────────────────────────────────

router.patch('/:operatorId/identity-from-description', async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const { description } = req.body as { description?: string };
  if (!description?.trim()) { res.status(400).json({ error: 'description required' }); return; }

  const [op] = await db.select().from(operatorsTable).where(ownerOp(req, operatorId));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  try {
    const result = await chatCompletion([
      { role: 'system', content: 'You update operator identity fields from a plain-text description. Return only valid JSON.' },
      { role: 'user', content: `Current operator name: ${op.name}\nUpdate the identity from this description:\n\n${description}\n\nReturn JSON with: { "rawIdentity": "...", "coreValues": [...], "ethicalBoundaries": [...], "domainTags": [...] }` },
    ], { model: CHAT_MODEL });

    const raw = result.content.replace(/```json\n?|\n?```/g, '').trim();
    const updates = JSON.parse(raw) as { rawIdentity?: string; coreValues?: string[]; ethicalBoundaries?: string[]; domainTags?: string[] };

    const [updated] = await db.update(operatorsTable).set({
      rawIdentity: updates.rawIdentity ?? op.rawIdentity,
      coreValues: updates.coreValues ?? op.coreValues,
      ethicalBoundaries: updates.ethicalBoundaries ?? op.ethicalBoundaries,
      domainTags: updates.domainTags ?? op.domainTags,
    }).where(ownerOp(req, operatorId)).returning();

    res.json(formatOperator(updated));
  } catch (err) {
    res.status(502).json({ error: 'Identity generation failed', detail: (err as Error).message });
  }
});

// ── Soul from description (AI) ────────────────────────────────────────────────

router.patch('/:operatorId/soul/from-description', async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const { description } = req.body as { description?: string };
  if (!description?.trim()) { res.status(400).json({ error: 'description required' }); return; }

  const [op] = await db.select().from(operatorsTable).where(ownerOp(req, operatorId));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  try {
    const result = await chatCompletion([
      { role: 'system', content: 'You update operator soul fields from a plain-text description. Return only valid JSON.' },
      { role: 'user', content: `Operator: ${op.name}\nUpdate the soul/personality from:\n\n${description}\n\nReturn JSON with these soul fields: { "backstory": "...", "personalityTraits": [...], "toneProfile": "...", "communicationStyle": "...", "emotionalRange": "...", "decisionMakingStyle": "...", "conflictResolution": "..." }` },
    ], { model: CHAT_MODEL });

    const raw = result.content.replace(/```json\n?|\n?```/g, '').trim();
    const soulUpdates = JSON.parse(raw) as Record<string, unknown>;
    const currentSoul = (op.layer2Soul ?? {}) as Record<string, unknown>;
    const newSoul = { ...currentSoul, ...soulUpdates };

    const [updated] = await db.update(operatorsTable).set({ layer2Soul: newSoul })
      .where(ownerOp(req, operatorId)).returning();
    res.json(formatOperator(updated));
  } catch (err) {
    res.status(502).json({ error: 'Soul generation failed', detail: (err as Error).message });
  }
});

// ── Lock Layer 1 ──────────────────────────────────────────────────────────────

router.post('/:operatorId/lock-layer1', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db.update(operatorsTable).set({ layer1LockedAt: new Date() })
    .where(ownerOp(req, req.params.operatorId)).returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json({ ok: true, layer1LockedAt: op.layer1LockedAt });
});

// ── GROW lock ─────────────────────────────────────────────────────────────────

router.patch('/:operatorId/grow-lock', async (req: Request, res: Response): Promise<void> => {
  const { level } = req.body as { level?: string };
  if (!level || !GROW_LOCK_LEVELS.includes(level as typeof GROW_LOCK_LEVELS[number])) {
    res.status(400).json({ error: `level must be one of: ${GROW_LOCK_LEVELS.join(', ')}` }); return;
  }
  const [op] = await db.update(operatorsTable).set({ growLockLevel: level })
    .where(ownerOp(req, req.params.operatorId)).returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json({ ok: true, growLockLevel: op.growLockLevel });
});

// ── Safe mode ─────────────────────────────────────────────────────────────────

router.patch('/:operatorId/safe-mode', async (req: Request, res: Response): Promise<void> => {
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') { res.status(400).json({ error: 'enabled (boolean) required' }); return; }
  const [op] = await db.update(operatorsTable).set({ safeMode: enabled })
    .where(ownerOp(req, req.params.operatorId)).returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json({ ok: true, safeMode: op.safeMode });
});

// ── Model settings ────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { model: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (default)', default: true },
  { model: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast, cheaper)' },
  { model: 'google/gemini-flash-2.0', label: 'Gemini Flash 2.0' },
  { model: 'openai/gpt-4o', label: 'GPT-4o' },
  { model: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (fast)' },
];

router.get('/:operatorId/model-settings/options', async (_req: Request, res: Response): Promise<void> => {
  res.json({ models: MODEL_OPTIONS });
});

router.patch('/:operatorId/model-settings', async (req: Request, res: Response): Promise<void> => {
  const { defaultModel, apiKey } = req.body as { defaultModel?: string | null; apiKey?: string | null };

  const updates: Partial<typeof operatorsTable.$inferInsert> = {};
  if (defaultModel !== undefined) updates.defaultModel = defaultModel;
  if (apiKey !== undefined) updates.openrouterApiKey = apiKey ? encryptToken(apiKey) : null;

  const [op] = await db.update(operatorsTable).set(updates)
    .where(ownerOp(req, req.params.operatorId)).returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(formatOperator(op));
});

router.post('/:operatorId/model-settings/verify-key', async (req: Request, res: Response): Promise<void> => {
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey?.trim()) { res.status(400).json({ error: 'apiKey required' }); return; }
  try {
    const result = await chatCompletion(
      [{ role: 'user', content: 'Reply with the single word: verified' }],
      { apiKey: apiKey.trim(), model: 'anthropic/claude-haiku-4-5' },
    );
    const valid = result.content.toLowerCase().includes('verified');
    res.json({ ok: valid, message: valid ? 'Key is working' : 'Key responded but got unexpected output' });
  } catch (err) {
    res.status(400).json({ ok: false, error: 'Key verification failed', detail: (err as Error).message });
  }
});

// ── Recompute self-awareness ──────────────────────────────────────────────────

router.post('/:operatorId/recompute-awareness', async (req: Request, res: Response): Promise<void> => {
  await recomputeSelfAwareness(req.params.operatorId, 'force');
  res.json({ ok: true });
});

// ── Soft delete ───────────────────────────────────────────────────────────────

router.delete('/:operatorId', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db.update(operatorsTable).set({ deletedAt: new Date() })
    .where(ownerOp(req, req.params.operatorId)).returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json({ ok: true });
});

export default router;
