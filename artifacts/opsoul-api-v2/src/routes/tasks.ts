import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { tasksTable, operatorsTable } from '@workspace/db-v2';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';

const router = Router({ mergeParams: true });

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db.select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, req.params.operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return null; }
  return op.id;
}

function serializeTask(r: typeof tasksTable.$inferSelect) {
  return {
    id: r.id,
    operatorId: r.operatorId,
    name: r.contextName,
    schedule: r.taskType,
    description: (r.payload as any)?.description ?? '',
    customSchedule: (r.payload as any)?.customSchedule ?? null,
    status: r.status ?? 'active',
    createdAt: r.createdAt,
    lastRunAt: (r.payload as any)?.lastRunAt ?? null,
    lastRunSummary: (r.payload as any)?.lastRunSummary ?? null,
  };
}

const CreateTaskSchema = z.object({
  name: z.string().min(1).max(200),
  schedule: z.enum(['daily', 'weekly', 'custom']),
  description: z.string().min(1).max(2000),
  customSchedule: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  schedule: z.enum(['daily', 'weekly', 'custom']).optional(),
  description: z.string().min(1).max(2000).optional(),
  customSchedule: z.string().optional(),
  status: z.enum(['active', 'paused']).optional(),
});

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const rows = await db.select().from(tasksTable)
    .where(eq(tasksTable.operatorId, operatorId))
    .orderBy(desc(tasksTable.createdAt));

  res.json({ tasks: rows.map(serializeTask) });
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateTaskSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const { name, schedule, description, customSchedule } = parsed.data;
  const [created] = await db.insert(tasksTable).values({
    id: crypto.randomUUID(),
    operatorId,
    contextName: name,
    taskType: schedule,
    integrationLabel: 'automation',
    payload: { description, customSchedule: customSchedule ?? null },
    status: 'active',
  }).returning();

  triggerSelfAwareness(operatorId, 'conversation_end');
  res.status(201).json(serializeTask(created));
});

// ── Update ────────────────────────────────────────────────────────────────────

router.patch('/:taskId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db.select().from(tasksTable)
    .where(and(eq(tasksTable.id, req.params.taskId), eq(tasksTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Task not found' }); return; }

  const parsed = UpdateTaskSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }); return; }

  const { name, schedule, description, customSchedule, status } = parsed.data;
  const currentPayload = (existing.payload as any) ?? {};

  const [updated] = await db.update(tasksTable).set({
    contextName: name ?? existing.contextName,
    taskType: schedule ?? existing.taskType,
    payload: { description: description ?? currentPayload.description, customSchedule: customSchedule ?? currentPayload.customSchedule },
    status: status ?? existing.status,
  }).where(eq(tasksTable.id, existing.id)).returning();

  triggerSelfAwareness(operatorId, 'conversation_end');
  res.json(serializeTask(updated));
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete('/:taskId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db.select({ id: tasksTable.id }).from(tasksTable)
    .where(and(eq(tasksTable.id, req.params.taskId), eq(tasksTable.operatorId, operatorId)));
  if (!existing) { res.status(404).json({ error: 'Task not found' }); return; }

  await db.delete(tasksTable).where(eq(tasksTable.id, existing.id));
  triggerSelfAwareness(operatorId, 'conversation_end');
  res.json({ ok: true });
});

export default router;
