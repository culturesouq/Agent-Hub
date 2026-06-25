import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import { platformSkillsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq } from 'drizzle-orm';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const CreatePlatformSkillSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  triggerDescription: z.string().max(300).optional(),
  instructions: z.string().min(1).max(8000),
  outputFormat: z.string().max(500).optional(),
  author: z.string().max(100).optional(),
  archetype: z.string().max(50).optional(),
});

const UpdatePlatformSkillSchema = CreatePlatformSkillSchema.partial();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreatePlatformSkillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [skill] = await db.insert(platformSkillsTable).values({
    id: crypto.randomUUID(),
    name: parsed.data.name,
    description: parsed.data.description,
    triggerDescription: parsed.data.triggerDescription,
    instructions: parsed.data.instructions,
    outputFormat: parsed.data.outputFormat,
    author: parsed.data.author ?? req.owner!.ownerId,
    archetype: parsed.data.archetype ?? 'All',
    installCount: 0,
  }).returning();

  res.status(201).json(skill);
});

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const skills = await db.select().from(platformSkillsTable);
  res.json({ count: skills.length, skills });
});

router.get('/:skillId', async (req: Request, res: Response): Promise<void> => {
  const [skill] = await db
    .select()
    .from(platformSkillsTable)
    .where(eq(platformSkillsTable.id, req.params.skillId as string));

  if (!skill) { res.status(404).json({ error: 'Skill not found' }); return; }
  res.json(skill);
});

router.patch('/:skillId', async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdatePlatformSkillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [existing] = await db
    .select({ id: platformSkillsTable.id })
    .from(platformSkillsTable)
    .where(eq(platformSkillsTable.id, req.params.skillId as string));

  if (!existing) { res.status(404).json({ error: 'Skill not found' }); return; }

  const [updated] = await db
    .update(platformSkillsTable)
    .set(parsed.data)
    .where(eq(platformSkillsTable.id, req.params.skillId as string))
    .returning();

  res.json(updated);
});

router.delete('/:skillId', async (req: Request, res: Response): Promise<void> => {
  const [existing] = await db
    .select({ id: platformSkillsTable.id })
    .from(platformSkillsTable)
    .where(eq(platformSkillsTable.id, req.params.skillId as string));

  if (!existing) { res.status(404).json({ error: 'Skill not found' }); return; }

  await db.delete(platformSkillsTable).where(eq(platformSkillsTable.id, req.params.skillId as string));
  res.json({ ok: true, deleted: req.params.skillId as string });
});

export default router;
