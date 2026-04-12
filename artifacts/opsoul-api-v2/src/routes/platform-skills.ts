import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { platformSkillsTable, ownersTable } from '@workspace/db-v2';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const SOVEREIGN_ADMINS = (process.env.SOVEREIGN_ADMIN_EMAILS ?? 'mohamedhajeri887@gmail.com,smoketest@opsoul.dev')
  .split(',').map(e => e.trim().toLowerCase());

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const [owner] = await db.select({ isSovereignAdmin: ownersTable.isSovereignAdmin, email: ownersTable.email })
    .from(ownersTable).where(eq(ownersTable.id, req.owner!.ownerId));
  if (!owner?.isSovereignAdmin && !SOVEREIGN_ADMINS.includes(owner?.email?.toLowerCase() ?? '')) {
    res.status(403).json({ error: 'Sovereign admin access required' }); return false;
  }
  return true;
}

const CreateSkillSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  instructions: z.string().min(1).max(8000),
  outputFormat: z.string().optional(),
  archetype: z.string().optional().default('All'),
  integrationType: z.string().optional(),
});

const UpdateSkillSchema = CreateSkillSchema.partial();

// ── List (public — no auth needed for this one) ───────────────────────────────

router.get('/', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const skills = await db.select({
    id: platformSkillsTable.id,
    name: platformSkillsTable.name,
    description: platformSkillsTable.description,
    archetype: platformSkillsTable.archetype,
    integrationType: platformSkillsTable.integrationType,
    installCount: platformSkillsTable.installCount,
  }).from(platformSkillsTable);
  res.json({ count: skills.length, skills });
});

// ── Get single ────────────────────────────────────────────────────────────────

router.get('/:skillId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const [skill] = await db.select().from(platformSkillsTable).where(eq(platformSkillsTable.id, req.params.skillId));
  if (!skill) { res.status(404).json({ error: 'Skill not found' }); return; }
  res.json(skill);
});

// ── Create (admin only) ───────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const parsed = CreateSkillSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const [skill] = await db.insert(platformSkillsTable).values({
    id: crypto.randomUUID(),
    ...parsed.data,
  }).returning();
  res.status(201).json(skill);
});

// ── Update (admin only) ───────────────────────────────────────────────────────

router.patch('/:skillId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const parsed = UpdateSkillSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const [skill] = await db.update(platformSkillsTable).set(parsed.data)
    .where(eq(platformSkillsTable.id, req.params.skillId)).returning();
  if (!skill) { res.status(404).json({ error: 'Skill not found' }); return; }
  res.json(skill);
});

// ── Delete (admin only) ───────────────────────────────────────────────────────

router.delete('/:skillId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const [existing] = await db.select({ id: platformSkillsTable.id }).from(platformSkillsTable)
    .where(eq(platformSkillsTable.id, req.params.skillId));
  if (!existing) { res.status(404).json({ error: 'Skill not found' }); return; }

  await db.delete(platformSkillsTable).where(eq(platformSkillsTable.id, existing.id));
  res.json({ ok: true });
});

export default router;
