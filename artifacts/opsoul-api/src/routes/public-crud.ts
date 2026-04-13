import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db';
import {
  operatorsTable,
  operatorSkillsTable,
  platformSkillsTable,
} from '@workspace/db';
import { requireSlotKey } from '../middleware/requireSlotKey.js';
import { chatCompletion } from '../utils/openrouter.js';
import { executeSkill } from '../utils/skillExecutor.js';
import { detectSkillTrigger } from '../utils/skillTriggerEngine.js';
import type { InstalledSkill } from '../utils/skillTriggerEngine.js';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import type { ActiveSkill } from '../utils/systemPrompt.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { eq, and } from 'drizzle-orm';

const router = Router();
router.use(requireSlotKey);

const CrudActionSchema = z.object({
  action:  z.string().min(1).max(500),
  payload: z.record(z.unknown()).optional(),
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const slot = req.slot!;

  if (slot.surfaceType !== 'crud') {
    res.status(403).json({ error: 'Only crud slots can use this endpoint' });
    return;
  }

  const parsed = CrudActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { action, payload } = parsed.data;

  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.id, slot.operatorId));

  if (!operator) {
    res.status(404).json({ error: 'Operator not found' });
    return;
  }

  // ── Skills ──
  const installedRows = await db
    .select({
      id: operatorSkillsTable.id,
      skillId: operatorSkillsTable.skillId,
      customInstructions: operatorSkillsTable.customInstructions,
      name: platformSkillsTable.name,
      instructions: platformSkillsTable.instructions,
      outputFormat: platformSkillsTable.outputFormat,
      triggerDescription: platformSkillsTable.triggerDescription,
      integrationType: platformSkillsTable.integrationType,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(and(eq(operatorSkillsTable.operatorId, slot.operatorId), eq(operatorSkillsTable.isActive, true)));

  const installedNames = new Set(installedRows.map(s => s.name));
  const archetypeDefaults = await loadArchetypeSkills(operator.archetype ?? ['All']);

  const allSkills: InstalledSkill[] = [
    ...installedRows.map(s => ({
      installId:          s.id,
      skillId:            s.skillId,
      name:               s.name,
      triggerDescription: s.triggerDescription ?? '',
      instructions:       s.instructions,
      outputFormat:       s.outputFormat ?? null,
      customInstructions: s.customInstructions ?? null,
      integrationType:    s.integrationType ?? null,
    })),
    ...archetypeDefaults
      .filter(a => !installedNames.has(a.name))
      .map(a => ({
        installId:          a.installId,
        skillId:            a.skillId,
        name:               a.name,
        triggerDescription: a.triggerDescription,
        instructions:       a.instructions,
        outputFormat:       a.outputFormat,
        customInstructions: null,
        integrationType:    a.integrationType ?? null,
      })),
  ];

  const actionText = payload
    ? `${action}\n\nPayload:\n${JSON.stringify(payload, null, 2)}`
    : action;

  // ── Try skill trigger first ──
  const trigger = await detectSkillTrigger(actionText, allSkills, operator.name);
  if (trigger) {
    try {
      trigger.operatorId = slot.operatorId;
      const skillModel = operator.defaultModel && operator.defaultModel !== 'opsoul/auto'
        ? operator.defaultModel
        : 'anthropic/claude-haiku-4-5';
      const skillResult = await executeSkill(trigger, skillModel);
      res.json({ result: skillResult.output, skill: trigger.skillName });
      return;
    } catch { /* fall through to LLM */ }
  }

  // ── KB context ──
  let ragContext = '';
  try {
    const embedding = await embed(action);
    const kbHits = await searchBothKbs(slot.operatorId, slot.ownerId, embedding, 5, 30);
    ragContext = buildRagContext(kbHits);
  } catch { /* non-fatal */ }

  // ── LLM fallback — pure function, no conversation stored ──
  const layer2Soul = operator.layer2Soul as Record<string, unknown> | null;

  const operatorIdentity = {
    name: operator.name,
    archetype: (operator.archetype ?? []) as string[],
    rawIdentity: operator.rawIdentity ?? '',
    mandate: (layer2Soul?.mandate as string) ?? operator.mandate ?? '',
    coreValues: (layer2Soul?.coreValues ?? null) as string[] | null,
    ethicalBoundaries: (layer2Soul?.ethicalBoundaries ?? null) as string[] | null,
    layer2Soul: layer2Soul as any,
  };

  const activeSkills: ActiveSkill[] = allSkills.map(s => ({
    name: s.name,
    instructions: s.instructions,
    outputFormat: s.outputFormat ?? undefined,
    customInstructions: s.customInstructions ?? undefined,
  }));

  const crudScopeLine = [
    `Surface: Action API (CRUD deployment) — slot "${slot.slotId}"`,
    `You are receiving a structured action request, not a conversation message.`,
    `Your job: execute the action described, use your knowledge and skills, and return a clear structured result.`,
    `Format: respond with JSON when the action implies data, plain text when it implies explanation, or a mix when both are needed.`,
    `Schema — action: string describing what to do | payload: optional object containing input data.`,
  ].join('\n');

  const systemPrompt = buildSystemPrompt(
    operatorIdentity,
    ragContext || undefined,
    activeSkills,
    undefined,
    undefined,
    { scopeLine: crudScopeLine },
  );

  const result = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: actionText },
    ],
    operator.defaultModel ?? 'anthropic/claude-haiku-4-5',
  );

  res.json({ result: result.content });
});

export default router;
