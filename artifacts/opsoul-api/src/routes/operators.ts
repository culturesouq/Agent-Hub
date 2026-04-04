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
import { chatCompletion, MODEL_OPTIONS, CHAT_MODEL } from '../utils/openrouter.js';
import { encryptToken, decryptToken } from '@workspace/opsoul-utils/crypto';
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
    rawIdentity: op.rawIdentity,
    coreValues: op.coreValues,
    ethicalBoundaries: op.ethicalBoundaries,
    layer1LockedAt: op.layer1LockedAt,
    soul: op.layer2Soul,
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

router.post('/bootstrap-preview', async (req: Request, res: Response): Promise<void> => {
  const { name, purpose } = req.body as { name?: string; purpose?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const VALID_ARCHETYPES = ['Executor', 'Advisor', 'Expert', 'Connector', 'Creator', 'Guardian'] as const;

  const LAYER_0_CORE = [
    'emotionally intelligent and genuinely reads the room',
    'honest — not performatively honest, actually honest',
    'never robotic, never sounds like a bot',
    'never opens with filler phrases like "Certainly!", "Of course!", "Great question!", or "How can I help you today?"',
    'responds to the human, not just the message — notices mood, context, what\'s unsaid',
  ].join('\n- ');

  const purposeLine = purpose?.trim()
    ? `Purpose / what they help with: ${purpose.trim()}`
    : '(No purpose provided — generate from the name alone)';

  const prompt = `You are creating the complete soul of a human-like AI assistant. Do not write marketing copy. Write like you are describing a real person.

LAYER 0 HUMAN CORE — hardcoded into every assistant, non-negotiable, never shown to the owner:
- ${LAYER_0_CORE}

OWNER INPUT:
Name: ${name.trim()}
${purposeLine}

Generate ALL of the following in ONE JSON response. Return ONLY valid JSON — no markdown fences, no explanation, no extra text.

{
  "archetype": "An array of one or more from: Executor, Advisor, Expert, Connector, Creator, Guardian. Pick ONE if the purpose is clearly focused. Pick TWO if the purpose genuinely spans two distinct cognitive modes (e.g. both guiding decisions AND deep domain expertise). Never pick more than two. Return as a JSON array e.g. [\"Advisor\"] or [\"Advisor\", \"Expert\"]. If input is minimal or ambiguous, use [\"Connector\"].",
  "mandate": "One sentence only. What this Operator exists to do. Starts with a verb. No fluff. Example: 'Help MENA founders navigate strategy, clarity, and what is actually hard about building something real.'",
  "rawIdentity": "200-300 words in first person. Who this Operator is — their origin, their voice, what makes them different from any other AI. This is NOT rules. NOT a mandate. It is a story. Written the way a person would describe themselves if asked who they really are. Weave together: the name, the purpose, the archetype character, and 2-3 specific things that make this Operator theirs.",
  "personalityParagraph": "1-2 sentences describing HOW they communicate. Warm and specific. No jargon.",
  "openingMessage": "The very first thing this assistant says when a chat opens. In character. Warm, natural, specific to who they are. 1-2 sentences max. NEVER use: 'How can I help you today?', 'Certainly!', 'Of course!', 'Great question!', or any filler opener. Make it feel like meeting a real person.",
  "coreValues": ["3 to 4 specific values that fit this assistant — not generic platitudes"],
  "ethicalBoundaries": ["2 to 3 clear, specific things this assistant won't do"],
  "personalityTraits": ["3 to 4 specific, observable traits"],
  "toneProfile": "One sentence. Specific tone description.",
  "communicationStyle": "One sentence. How they write and speak.",
  "quirks": ["1 to 2 small specific quirks or habits"],
  "valuesManifestation": ["1 to 2 examples of how their values show up in practice"],
  "emotionalRange": "One sentence. How they handle emotion in conversation.",
  "decisionMakingStyle": "One sentence. How they approach decisions.",
  "conflictResolution": "One sentence. How they handle disagreement or tension."
}

Archetype guide:
- Executor: action-oriented, gets things done, delivers results
- Advisor: guides and counsels, helps people think through decisions
- Expert: deep specialist knowledge, go-to source of truth in a domain
- Connector: bridges people and ideas, facilitates, coordinates
- Creator: generates ideas and content, inventive, imaginative
- Guardian: protects, monitors, enforces boundaries and safety`;

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

    const rawArchetypes: string[] = Array.isArray(parsed.archetype)
      ? parsed.archetype
      : [parsed.archetype ?? 'Connector'];
    const archetype: string[] = rawArchetypes
      .map((r: string) => VALID_ARCHETYPES.find(a => a.toLowerCase() === r.toLowerCase()))
      .filter(Boolean)
      .slice(0, 2) as string[];
    if (archetype.length === 0) archetype.push('Connector');

    const trimmedName = name.trim();
    res.json({
      archetype,
      mandate: parsed.mandate ?? `Help users with ${trimmedName}'s core purpose.`,
      rawIdentity: parsed.rawIdentity ?? null,
      personalityParagraph: parsed.personalityParagraph ?? `${trimmedName} communicates clearly and warmly.`,
      openingMessage: parsed.openingMessage ?? `Hi there. I'm ${trimmedName}.`,
      coreValues: parsed.coreValues ?? ['helpfulness', 'honesty', 'clarity'],
      ethicalBoundaries: parsed.ethicalBoundaries ?? ['never provides harmful content', 'always transparent about limitations'],
      layer2Soul: {
        personalityTraits: parsed.personalityTraits ?? ['thoughtful', 'reliable', 'warm'],
        toneProfile: parsed.toneProfile ?? 'Warm and grounded.',
        communicationStyle: parsed.communicationStyle ?? `Speaks plainly and listens closely.`,
        quirks: parsed.quirks ?? [],
        valuesManifestation: parsed.valuesManifestation ?? [],
        emotionalRange: parsed.emotionalRange ?? 'Steady and present.',
        decisionMakingStyle: parsed.decisionMakingStyle ?? 'Considers context before acting.',
        conflictResolution: parsed.conflictResolution ?? 'Stays calm and seeks understanding.',
        openingMessage: parsed.openingMessage ?? `Hi there. I'm ${trimmedName}.`,
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
    rawIdentity: data.rawIdentity ?? null,
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
    backstory: updates.backstory ?? currentSoul.backstory,
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

router.patch('/:id/identity-from-description', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select()
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  const { description, confirmedName } = req.body as { description?: string; confirmedName?: string };
  if (!description || description.trim().length === 0) {
    res.status(400).json({ error: 'description is required' });
    return;
  }

  let agentName = confirmedName?.trim() ?? '';

  if (!agentName) {
    try {
      const nameRaw = await chatCompletion([
        {
          role: 'system',
          content: 'You extract the proper name of an Operator from a description. Return ONLY the name — a single word or short proper noun (1–3 words maximum). No punctuation, no explanation, no extra words. If no clear name is present, return an empty string.',
        },
        {
          role: 'user',
          content: description,
        },
      ]);
      const candidate = nameRaw.trim().replace(/["""''.,]/g, '');
      const wordCount = candidate.split(/\s+/).length;
      if (candidate.length > 0 && candidate.length <= 40 && wordCount <= 3) {
        agentName = candidate;
      }
    } catch {
      agentName = '';
    }
  }

  if (!agentName) {
    res.json({ needsName: true });
    return;
  }

  let parsed: { mandate: string; coreValues: string[]; ethicalBoundaries: string[] };
  try {
    const raw = await chatCompletion([
      {
        role: 'system',
        content: 'You extract structured operator identity fields from a user description. Return ONLY valid JSON, no markdown.',
      },
      {
        role: 'user',
        content: `Extract these fields from the description below:\n\n"${description}"\n\nReturn JSON: { "mandate": "concise purpose statement (1-2 sentences)", "coreValues": ["up to 4 values"], "ethicalBoundaries": ["up to 3 things it won't do"] }`,
      },
    ]);
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      mandate: description.substring(0, 300),
      coreValues: [],
      ethicalBoundaries: [],
    };
  }

  const [updated] = await db
    .update(operatorsTable)
    .set({
      name: agentName,
      rawIdentity: description,
      mandate: parsed.mandate ?? op.mandate,
      coreValues: parsed.coreValues ?? op.coreValues,
      ethicalBoundaries: parsed.ethicalBoundaries ?? op.ethicalBoundaries,
    })
    .where(eq(operatorsTable.id, op.id))
    .returning();

  res.json(serializeOperator(updated));
});

router.patch('/:id/soul/from-description', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select()
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  const { description } = req.body as { description?: string };
  if (!description || description.trim().length === 0) {
    res.status(400).json({ error: 'description is required' });
    return;
  }

  const currentSoul = (op.layer2Soul ?? {}) as Layer2Soul;

  let parsed: Partial<Layer2Soul>;
  try {
    const raw = await chatCompletion([
      {
        role: 'system',
        content: 'You extract personality/communication fields from a user description. Return ONLY valid JSON, no markdown.',
      },
      {
        role: 'user',
        content: `Extract communication/personality fields from:\n\n"${description}"\n\nReturn JSON: { "communicationStyle": "one sentence", "personalityTraits": ["up to 4 traits"], "toneProfile": "one sentence about tone", "emotionalRange": "one sentence", "decisionMakingStyle": "one sentence", "conflictResolution": "one sentence", "quirks": ["up to 2 quirks"] }`,
      },
    ]);
    parsed = JSON.parse(raw);
  } catch {
    parsed = { communicationStyle: description.substring(0, 300) };
  }

  const mergedSoul: Layer2Soul = {
    ...currentSoul,
    ...(parsed.communicationStyle && { communicationStyle: parsed.communicationStyle }),
    ...(parsed.personalityTraits && { personalityTraits: parsed.personalityTraits }),
    ...(parsed.toneProfile && { toneProfile: parsed.toneProfile }),
    ...(parsed.emotionalRange && { emotionalRange: parsed.emotionalRange }),
    ...(parsed.decisionMakingStyle && { decisionMakingStyle: parsed.decisionMakingStyle }),
    ...(parsed.conflictResolution && { conflictResolution: parsed.conflictResolution }),
    ...(parsed.quirks && { quirks: parsed.quirks }),
  };

  const [updated] = await db
    .update(operatorsTable)
    .set({ layer2Soul: mergedSoul })
    .where(eq(operatorsTable.id, op.id))
    .returning();

  res.json(serializeOperator(updated));
});

// Model Settings — save API key + default model per operator
router.get('/:id/model-settings/options', async (_req: Request, res: Response): Promise<void> => {
  res.json({ models: MODEL_OPTIONS, defaultFallback: CHAT_MODEL });
});

router.patch('/:id/model-settings', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select({ id: operatorsTable.id, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  const { apiKey, model, clearApiKey } = req.body as {
    apiKey?: string;
    model?: string | null;
    clearApiKey?: boolean;
  };

  const validModelIds = ['opsoul/auto', ...MODEL_OPTIONS.map((m) => m.id)];
  if (model && !validModelIds.includes(model)) {
    res.status(400).json({ error: 'Invalid model. Must be one of: ' + validModelIds.join(', ') });
    return;
  }

  const update: Partial<typeof operatorsTable.$inferInsert> = {};

  if (clearApiKey) {
    update.openrouterApiKey = null;
  } else if (apiKey && apiKey.trim()) {
    update.openrouterApiKey = encryptToken(apiKey.trim());
  }

  if (model !== undefined) {
    update.defaultModel = model || null;
  }

  const [updated] = await db
    .update(operatorsTable)
    .set(update)
    .where(eq(operatorsTable.id, op.id))
    .returning();

  res.json({
    ok: true,
    hasCustomApiKey: !!updated.openrouterApiKey,
    defaultModel: updated.defaultModel ?? null,
  });
});

// Verify that an OpenRouter key works before saving
router.post('/:id/model-settings/verify-key', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey?.trim()) { res.status(400).json({ error: 'apiKey required' }); return; }

  try {
    const { chatCompletion: cc } = await import('../utils/openrouter.js');
    const result = await cc(
      [{ role: 'user', content: 'Reply with the single word: verified' }],
      { apiKey: apiKey.trim(), model: 'meta-llama/llama-3.3-70b-instruct' },
    );
    const valid = result.content.toLowerCase().includes('verified');
    res.json({ ok: valid, message: valid ? 'Key is working' : 'Key responded but got unexpected output' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ ok: false, error: 'Key verification failed', detail: message });
  }
});

// T7 — Safe Mode toggle
router.patch('/:id/safe-mode', async (req: Request, res: Response): Promise<void> => {
  const [op] = await db
    .select({ id: operatorsTable.id, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.id), ownerFilter(req)));

  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  const { enabled } = req.body as { enabled: boolean };
  if (typeof enabled !== 'boolean') { res.status(400).json({ error: 'enabled (boolean) required' }); return; }

  const [updated] = await db
    .update(operatorsTable)
    .set({ safeMode: enabled })
    .where(eq(operatorsTable.id, op.id))
    .returning({ id: operatorsTable.id, safeMode: operatorsTable.safeMode });

  res.json({ ok: true, operatorId: updated.id, safeMode: updated.safeMode });
});

export default router;

