import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import { operatorSkillsTable, platformSkillsTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and } from 'drizzle-orm';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op.id;
}

const InstallSkillSchema = z.object({
  skillId: z.string().min(1),
  customInstructions: z.string().max(2000).optional(),
});

const UpdateInstallSchema = z.object({
  customInstructions: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = InstallSkillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [skill] = await db
    .select()
    .from(platformSkillsTable)
    .where(eq(platformSkillsTable.id, parsed.data.skillId));

  if (!skill) { res.status(404).json({ error: 'Platform skill not found' }); return; }

  const [existing] = await db
    .select({ id: operatorSkillsTable.id })
    .from(operatorSkillsTable)
    .where(
      and(
        eq(operatorSkillsTable.operatorId, operatorId),
        eq(operatorSkillsTable.skillId, parsed.data.skillId),
      ),
    );

  if (existing) {
    res.status(409).json({ error: 'Skill already installed on this operator' });
    return;
  }

  const [install] = await db.insert(operatorSkillsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    skillId: parsed.data.skillId,
    customInstructions: parsed.data.customInstructions,
    isActive: true,
  }).returning();

  await db.update(platformSkillsTable)
    .set({ installCount: (skill.installCount ?? 0) + 1 })
    .where(eq(platformSkillsTable.id, parsed.data.skillId));

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.status(201).json({ ...install, skill: { name: skill.name, description: skill.description } });
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const installs = await db
    .select({
      id: operatorSkillsTable.id,
      operatorId: operatorSkillsTable.operatorId,
      skillId: operatorSkillsTable.skillId,
      customInstructions: operatorSkillsTable.customInstructions,
      isActive: operatorSkillsTable.isActive,
      installedAt: operatorSkillsTable.installedAt,
      skillName: platformSkillsTable.name,
      skillDescription: platformSkillsTable.description,
      skillInstructions: platformSkillsTable.instructions,
      skillOutputFormat: platformSkillsTable.outputFormat,
      skillTriggerDescription: platformSkillsTable.triggerDescription,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(eq(operatorSkillsTable.operatorId, operatorId));

  res.json({ operatorId, count: installs.length, skills: installs });
});

router.patch('/:installId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = UpdateInstallSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [existing] = await db
    .select()
    .from(operatorSkillsTable)
    .where(
      and(
        eq(operatorSkillsTable.id, req.params.installId),
        eq(operatorSkillsTable.operatorId, operatorId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Skill install not found' }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.customInstructions !== undefined) {
    updates.customInstructions = parsed.data.customInstructions;
  }
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  const [updated] = await db
    .update(operatorSkillsTable)
    .set(updates)
    .where(eq(operatorSkillsTable.id, req.params.installId))
    .returning();

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.json(updated);
});

router.delete('/:installId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select()
    .from(operatorSkillsTable)
    .where(
      and(
        eq(operatorSkillsTable.id, req.params.installId),
        eq(operatorSkillsTable.operatorId, operatorId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Skill install not found' }); return; }

  await db.delete(operatorSkillsTable).where(eq(operatorSkillsTable.id, req.params.installId));

  const [skill] = await db
    .select({ installCount: platformSkillsTable.installCount })
    .from(platformSkillsTable)
    .where(eq(platformSkillsTable.id, existing.skillId));

  if (skill) {
    await db.update(platformSkillsTable)
      .set({ installCount: Math.max(0, (skill.installCount ?? 1) - 1) })
      .where(eq(platformSkillsTable.id, existing.skillId));
  }

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.json({ ok: true, uninstalled: req.params.installId });
});

export default router;
