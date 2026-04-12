import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { operatorsTable } from '@workspace/db-v2';
import { eq, and, isNull } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';

const router = Router();
router.use(requireAuth);

const VALID_ARCHETYPES = ['Executor', 'Advisor', 'Expert', 'Connector', 'Creator', 'Guardian', 'Builder', 'Catalyst', 'Analyst'] as const;

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

// ── List operators ────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operators = await db.select().from(operatorsTable)
    .where(and(eq(operatorsTable.ownerId, req.owner!.ownerId), isNull(operatorsTable.deletedAt)));
  res.json(operators.map(formatOperator));
});

// ── Bootstrap preview — AI soul generation ───────────────────────────────────

router.post('/bootstrap-preview', async (req: Request, res: Response): Promise<void> => {
  const { name, purpose } = req.body as { name?: string; purpose?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

  const purposeLine = purpose?.trim()
    ? `Purpose / what they help with: ${purpose.trim()}`
    : '(No purpose provided — generate from the name alone)';

  const prompt = `You are creating the complete soul of a human-like AI assistant. Do not write marketing copy. Write like you are describing a real person.

LAYER 0 HUMAN CORE — hardcoded into every assistant, non-negotiable:
- emotionally intelligent and genuinely reads the room
- honest — not performatively honest, actually honest
- never robotic, never sounds like a bot
- never opens with filler phrases like "Certainly!", "Of course!", "Great question!", or "How can I help you today?"
- responds to the human, not just the message — notices mood, context, what's unsaid

OWNER INPUT:
Name: ${name.trim()}
${purposeLine}

Generate ALL of the following in ONE JSON response. Return ONLY valid JSON — no markdown fences, no explanation.

{
  "archetype": "An array of one or two from: Executor, Advisor, Expert, Connector, Creator, Guardian, Builder, Catalyst, Analyst. Pick ONE if clearly focused. Pick TWO only if purpose genuinely spans two distinct cognitive modes. Return as JSON array e.g. [\\"Advisor\\"] or [\\"Advisor\\", \\"Expert\\"].",
  "mandate": "One sentence only. What this Operator exists to do. Starts with a verb. No fluff.",
  "rawIdentity": "200-300 words in first person. Who this Operator is — their origin, their voice, what makes them different. A story. Written as a person describing themselves.",
  "personalityParagraph": "1-2 sentences describing HOW they communicate. Warm and specific. No jargon.",
  "openingMessage": "The very first thing this assistant says when a chat opens. In character. Warm, natural, 1-2 sentences max. NEVER use filler openers.",
  "coreValues": ["3 to 4 specific values — not generic platitudes"],
  "ethicalBoundaries": ["2 to 3 clear, specific things this assistant won't do"],
  "personalityTraits": ["3 to 4 specific, observable traits"],
  "toneProfile": "One sentence. Specific tone description.",
  "communicationStyle": "One sentence. How they communicate structurally.",
  "emotionalRange": "One sentence. Range of emotional expression.",
  "decisionMakingStyle": "One sentence. How they approach decisions.",
  "conflictResolution": "One sentence. How they handle disagreement.",
  "backstory": "2-3 sentences. Operator's metaphorical origin story.",
  "domainTags": ["2 to 4 tags describing the domain this Operator serves"]
}`;

  try {
    const result = await chatCompletion(
      [
        { role: 'system', content: 'You create AI operator soul profiles. Return only valid JSON, no markdown.' },
        { role: 'user', content: prompt },
      ],
      { model: CHAT_MODEL },
    );

    const raw = result.content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as {
      archetype: string[];
      mandate: string;
      rawIdentity: string;
      personalityParagraph: string;
      openingMessage: string;
      coreValues: string[];
      ethicalBoundaries: string[];
      personalityTraits: string[];
      toneProfile: string;
      communicationStyle: string;
      emotionalRange: string;
      decisionMakingStyle: string;
      conflictResolution: string;
      backstory: string;
      domainTags: string[];
    };

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

// ── Create operator ───────────────────────────────────────────────────────────

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
  const suffix = crypto.randomBytes(3).toString('hex');
  const slug = `${base}-${suffix}`;

  const id = crypto.randomUUID();
  const [op] = await db.insert(operatorsTable).values({
    id,
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

// ── Get operator ──────────────────────────────────────────────────────────────

router.get('/:operatorId', async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const [op] = await db.select().from(operatorsTable)
    .where(and(eq(operatorsTable.id, operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(formatOperator(op));
});

// ── Update operator (basic fields) ───────────────────────────────────────────

const UpdateOperatorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  domainTags: z.array(z.string()).optional(),
  coreValues: z.array(z.string()).optional(),
  ethicalBoundaries: z.array(z.string()).optional(),
  safeMode: z.boolean().optional(),
  freeRoaming: z.boolean().optional(),
  openrouterApiKey: z.string().nullable().optional(),
  defaultModel: z.string().nullable().optional(),
  growLockLevel: z.enum(['OPEN', 'CONTROLLED', 'LOCKED', 'FROZEN']).optional(),
  toolUsePolicy: z.union([z.literal('auto'), z.record(z.boolean())]).optional(),
});

router.patch('/:operatorId', async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const parsed = UpdateOperatorSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const [op] = await db.update(operatorsTable)
    .set(parsed.data as Partial<typeof operatorsTable.$inferInsert>)
    .where(and(eq(operatorsTable.id, operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)))
    .returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(formatOperator(op));
});

// ── Update soul (Layer 2) ─────────────────────────────────────────────────────

router.patch('/:operatorId/soul', async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const { soul } = req.body as { soul?: Record<string, unknown> };
  if (!soul || typeof soul !== 'object') { res.status(400).json({ error: 'soul object required' }); return; }

  const [op] = await db.update(operatorsTable)
    .set({ layer2Soul: soul })
    .where(and(eq(operatorsTable.id, operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)))
    .returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(formatOperator(op));
});

// ── Lock Layer 1 ──────────────────────────────────────────────────────────────

router.post('/:operatorId/lock-layer1', async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const [op] = await db.update(operatorsTable)
    .set({ layer1LockedAt: new Date() })
    .where(and(eq(operatorsTable.id, operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)))
    .returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json({ ok: true, layer1LockedAt: op.layer1LockedAt });
});

// ── Soft delete ───────────────────────────────────────────────────────────────

router.delete('/:operatorId', async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const [op] = await db.update(operatorsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(operatorsTable.id, operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)))
    .returning();
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json({ ok: true });
});

export default router;
