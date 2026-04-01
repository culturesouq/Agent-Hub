import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  CreateOperatorSchema,
  UpdateOperatorLayer1Schema,
  UpdateSoulSchema,
  SetGrowLockSchema,
  type Layer2Soul,
} from '../validation/operator.js';
import { chatCompletion } from '../utils/openrouter.js';
import { eq, and } from 'drizzle-orm';
import { ZodError } from 'zod';

const router = Router();
router.use(requireAuth);

function zodError(res: Response, err: ZodError): void {
  res.status(400).json({ error: 'Validation failed', issues: err.flatten().fieldErrors });
}

function ownerFilter(req: Request) {
  return eq(operatorsTable.ownerId, req.owner!.ownerId);
}

function serializeOperator(op: typeof operatorsTable.$inferSelect) {
  return {
    id: op.id,
    ownerId: op.ownerId,
    slug: op.slug,
    name: op.name,
    archetype: op.archetype,
    mandate: op.mandate,
    coreValues: op.coreValues,
    ethicalBoundaries: op.ethicalBoundaries,
    layer1LockedAt: op.layer1LockedAt,
    soul: op.layer2Soul,
    growLockLevel: op.growLockLevel,
    lockedUntil: op.lockedUntil,
    safeMode: op.safeMode,
    toolUsePolicy: op.toolUsePolicy,
    createdAt: op.createdAt,
  };
}

router.post('/bootstrap-preview', async (req: Request, res: Response): Promise<void> => {
  const { name, purpose, personality } = req.body as { name?: string; purpose?: string; personality?: string };
  if (!name || !purpose || !personality) {
    res.status(400).json({ error: 'name, purpose, and personality are required' });
    return;
  }

  const VALID_ARCHETYPES = ['Executor', 'Advisor', 'Expert', 'Connector', 'Creator', 'Guardian'] as const;

  const prompt = `You are designing the identity of an AI operator. Based on the following:

Name: ${name}
Purpose: ${purpose}
Personality: ${personality}

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "archetype": "MUST be exactly one of: Executor, Advisor, Expert, Connector, Creator, Guardian",
  "description": "1-2 warm, human sentences introducing ${name} like you're introducing a real person — no titles, no labels, no jargon. Describe who they are and how they show up.",
  "coreValues": ["value1", "value2", "value3", "value4"],
  "ethicalBoundaries": ["boundary1", "boundary2", "boundary3"],
  "layer2Soul": {
    "personalityTraits": ["trait1", "trait2", "trait3", "trait4"],
    "toneProfile": "one sentence describing the tone",
    "communicationStyle": "one sentence describing how they communicate",
    "quirks": ["quirk1", "quirk2"],
    "valuesManifestation": ["how a value shows up in behavior", "another example"],
    "emotionalRange": "one sentence describing emotional range",
    "decisionMakingStyle": "one sentence describing how they make decisions",
    "conflictResolution": "one sentence describing conflict resolution approach"
  }
}

Archetype guide — choose the best fit:
- Executor: gets things done, action-oriented, implements and delivers
- Advisor: guides and counsels, strategic, helps people think through decisions
- Expert: deep domain knowledge, specialist, go-to source of truth
- Connector: bridges people and ideas, facilitates, coordinates
- Creator: generates ideas and content, inventive, brings new things into existence
- Guardian: protects, monitors, enforces safety and boundaries

The archetype field must be exactly one word from the list above. No variations.`;

  try {
    const result = await chatCompletion(
      [{ role: 'user', content: prompt }],
      'anthropic/claude-sonnet-4-5',
    );

    let parsed: any;
    try {
      const cleaned = result.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: 'Failed to parse AI response' });
      return;
    }

    const rawArchetype = (parsed.archetype ?? '').trim();
    const archetype: string = VALID_ARCHETYPES.find(
      a => a.toLowerCase() === rawArchetype.toLowerCase()
    ) ?? 'Advisor';

    res.json({
      archetype,
      description: parsed.description ?? `${name} is ready to help you.`,
      coreValues: parsed.coreValues ?? ['helpfulness', 'honesty'],
      ethicalBoundaries: parsed.ethicalBoundaries ?? ['no harmful content'],
      layer2Soul: parsed.layer2Soul ?? {
        personalityTraits: personality.split(',').map((s: string) => s.trim()).filter(Boolean),
        toneProfile: 'Friendly and professional',
        communicationStyle: 'Clear and concise',
        quirks: [],
        valuesManifestation: [],
        emotionalRange: 'Calm and measured',
        decisionMakingStyle: 'Analytical and thoughtful',
        conflictResolution: 'Collaborative and empathetic',
      },
    });
  } catch (err: any) {
    console.error('[bootstrap-preview] error:', err?.message);
    res.status(500).json({ error: 'Failed to generate operator profile' });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateOperatorSchema.safeParse(req.body);
  if (!parsed.success) { zodError(res, parsed.error); return; }

  const data = parsed.data;
  const ownerId = req.owner!.ownerId;

  const [existing] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(eq(operatorsTable.slug, data.slug));

  if (existing) {
    res.status(409).json({ error: `Slug "${data.slug}" is already taken` });
    return;
  }

  const [op] = await db.insert(operatorsTable).values({
    id: crypto.randomUUID(),
    ownerId,
    slug: data.slug,
    name: data.name,
    archetype: data.archetype,
    mandate: data.mandate,
    coreValues: data.coreValues,
    ethicalBoundaries: data.ethicalBoundaries,
    layer2Soul: data.layer2Soul,
    layer2SoulOriginal: data.layer2Soul,
    growLockLevel: data.growLockLevel,
    safeMode: data.safeMode,
    toolUsePolicy: data.toolUsePolicy,
  }).returning();

  res.status(201).json(serializeOperator(op));
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const ops = await db
    .select()
    .from(operatorsTable)
    .where(ownerFilter(req));

  res.json(ops.map(serializeOperator));
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select()
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }
  res.json(serializeOperator(op));
});

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select()
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  if (op.layer1LockedAt !== null) {
    res.status(423).json({
      error: 'Layer 1 identity is locked. Use /soul to update Layer 2.',
      lockedAt: op.layer1LockedAt,
    });
    return;
  }

  const parsed = UpdateOperatorLayer1Schema.safeParse(req.body);
  if (!parsed.success) { zodError(res, parsed.error); return; }

  const data = parsed.data;
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'No fields provided to update' });
    return;
  }

  const [updated] = await db
    .update(operatorsTable)
    .set(data)
    .where(eq(operatorsTable.id, op.id))
    .returning();

  res.json(serializeOperator(updated));
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  await db.delete(operatorsTable).where(eq(operatorsTable.id, op.id));
  res.json({ ok: true, deleted: op.id });
});

router.post('/:id/lock-layer1', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select()
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  if (op.layer1LockedAt !== null) {
    res.status(409).json({
      error: 'Layer 1 is already locked',
      lockedAt: op.layer1LockedAt,
    });
    return;
  }

  const [updated] = await db
    .update(operatorsTable)
    .set({ layer1LockedAt: new Date() })
    .where(eq(operatorsTable.id, op.id))
    .returning();

  res.json({ ok: true, lockedAt: updated.layer1LockedAt, operator: serializeOperator(updated) });
});

router.get('/:id/soul', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select({
      id: operatorsTable.id,
      name: operatorsTable.name,
      layer2Soul: operatorsTable.layer2Soul,
      layer2SoulOriginal: operatorsTable.layer2SoulOriginal,
      growLockLevel: operatorsTable.growLockLevel,
      lockedUntil: operatorsTable.lockedUntil,
      layer1LockedAt: operatorsTable.layer1LockedAt,
    })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  res.json({
    operatorId: op.id,
    operatorName: op.name,
    layer1Locked: op.layer1LockedAt !== null,
    growLockLevel: op.growLockLevel,
    lockedUntil: op.lockedUntil,
    soul: op.layer2Soul,
    soulOriginal: op.layer2SoulOriginal,
  });
});

router.patch('/:id/soul', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select()
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  if (op.growLockLevel === 'FROZEN') {
    res.status(423).json({
      error: 'Soul is FROZEN — no changes permitted until lock expires',
      lockedUntil: op.lockedUntil,
    });
    return;
  }

  const parsed = UpdateSoulSchema.safeParse(req.body);
  if (!parsed.success) { zodError(res, parsed.error); return; }

  const currentSoul = op.layer2Soul as Layer2Soul;
  const updates = parsed.data;

  const newSoul: Layer2Soul = {
    personalityTraits: updates.personalityTraits ?? currentSoul.personalityTraits,
    toneProfile: updates.toneProfile ?? currentSoul.toneProfile,
    communicationStyle: updates.communicationStyle ?? currentSoul.communicationStyle,
    quirks: updates.quirks ?? currentSoul.quirks,
    valuesManifestation: updates.valuesManifestation ?? currentSoul.valuesManifestation,
    emotionalRange: updates.emotionalRange ?? currentSoul.emotionalRange,
    decisionMakingStyle: updates.decisionMakingStyle ?? currentSoul.decisionMakingStyle,
    conflictResolution: updates.conflictResolution ?? currentSoul.conflictResolution,
  };

  const [updated] = await db
    .update(operatorsTable)
    .set({ layer2Soul: newSoul })
    .where(eq(operatorsTable.id, op.id))
    .returning();

  res.json({
    operatorId: updated.id,
    soul: updated.layer2Soul,
    soulOriginal: updated.layer2SoulOriginal,
    growLockLevel: updated.growLockLevel,
  });
});

router.post('/:id/soul/reset', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select()
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  if (op.growLockLevel === 'FROZEN') {
    res.status(423).json({
      error: 'Soul is FROZEN — reset not permitted until lock expires',
      lockedUntil: op.lockedUntil,
    });
    return;
  }

  const [updated] = await db
    .update(operatorsTable)
    .set({ layer2Soul: op.layer2SoulOriginal })
    .where(eq(operatorsTable.id, op.id))
    .returning();

  res.json({
    ok: true,
    operatorId: updated.id,
    soul: updated.layer2Soul,
    message: 'Layer 2 soul reset to original',
  });
});

router.patch('/:id/grow-lock', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select({ id: operatorsTable.id, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  const parsed = SetGrowLockSchema.safeParse(req.body);
  if (!parsed.success) { zodError(res, parsed.error); return; }

  const { level, lockedUntil } = parsed.data;

  const [updated] = await db
    .update(operatorsTable)
    .set({
      growLockLevel: level,
      lockedUntil: lockedUntil ? new Date(lockedUntil) : null,
    })
    .where(eq(operatorsTable.id, op.id))
    .returning();

  res.json({
    ok: true,
    operatorId: updated.id,
    growLockLevel: updated.growLockLevel,
    lockedUntil: updated.lockedUntil,
  });
});

export default router;
