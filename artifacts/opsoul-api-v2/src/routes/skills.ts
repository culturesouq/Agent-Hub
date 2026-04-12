import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db-v2';
import { platformSkillsTable, operatorSkillsTable } from '@workspace/db-v2';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.get('/platform-skills', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const skills = await db.select({
    id: platformSkillsTable.id,
    name: platformSkillsTable.name,
    description: platformSkillsTable.description,
    archetype: platformSkillsTable.archetype,
    integrationType: platformSkillsTable.integrationType,
    installCount: platformSkillsTable.installCount,
  }).from(platformSkillsTable);
  res.json(skills);
});

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const installs = await db
    .select({
      id: operatorSkillsTable.id,
      skillId: operatorSkillsTable.skillId,
      name: platformSkillsTable.name,
      description: platformSkillsTable.description,
      isActive: operatorSkillsTable.isActive,
      customInstructions: operatorSkillsTable.customInstructions,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(eq(operatorSkillsTable.operatorId, operatorId));
  res.json(installs);
});

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const { skillId, customInstructions } = req.body as { skillId?: string; customInstructions?: string };
  if (!skillId) { res.status(400).json({ error: 'skillId required' }); return; }

  const [install] = await db.insert(operatorSkillsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    skillId,
    customInstructions: customInstructions ?? null,
  }).returning();
  res.status(201).json(install);
});

router.patch('/:installId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, installId } = req.params as { operatorId: string; installId: string };
  const { isActive, customInstructions } = req.body as { isActive?: boolean; customInstructions?: string };

  const [updated] = await db.update(operatorSkillsTable)
    .set({ isActive: isActive ?? undefined, customInstructions: customInstructions ?? undefined })
    .where(and(eq(operatorSkillsTable.id, installId), eq(operatorSkillsTable.operatorId, operatorId)))
    .returning();
  res.json(updated);
});

router.delete('/:installId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, installId } = req.params as { operatorId: string; installId: string };
  await db.delete(operatorSkillsTable)
    .where(and(eq(operatorSkillsTable.id, installId), eq(operatorSkillsTable.operatorId, operatorId)));
  res.json({ ok: true });
});

export default router;
