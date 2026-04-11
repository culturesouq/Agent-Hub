import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db';
import { tasksTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';
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

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const rows = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.operatorId, operatorId))
    .orderBy(desc(tasksTable.createdAt));

  const tasks = rows.map(r => ({
    id: r.id,
    operatorId: r.operatorId,
    name: r.contextName,
    schedule: r.taskType,
    description: (r.payload as any)?.description ?? '',
    customSchedule: (r.payload as any)?.customSchedule,
    status: r.status ?? 'active',
    createdAt: r.createdAt,
    lastRunAt: (r.payload as any)?.lastRunAt ?? null,
    lastRunSummary: (r.payload as any)?.lastRunSummary ?? null,
    lastRunDurationSec: (r.payload as any)?.lastRunDurationSec ?? null,
  }));

  res.json({ tasks });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { name, schedule, description, customSchedule } = parsed.data;

  const [created] = await db
    .insert(tasksTable)
    .values({
      id: crypto.randomUUID(),
      operatorId,
      contextName: name,
      taskType: schedule,
      integrationLabel: 'automation',
      payload: { description, customSchedule: customSchedule ?? null },
      status: 'active',
    })
    .returning();

  triggerSelfAwareness(operatorId, 'conversation_end').catch(() => {});
  res.status(201).json({
    id: created.id,
    operatorId: created.operatorId,
    name: created.contextName,
    schedule: created.taskType,
    description,
    customSchedule,
    status: created.status,
    createdAt: created.createdAt,
  });
});

router.patch('/:taskId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.id, req.params.taskId), eq(tasksTable.operatorId, operatorId)));

  if (!existing) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const parsed = UpdateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { name, schedule, description, customSchedule, status } = parsed.data;
  const currentPayload = (existing.payload as any) ?? {};

  const [updated] = await db
    .update(tasksTable)
    .set({
      contextName: name ?? existing.contextName,
      taskType: schedule ?? existing.taskType,
      payload: {
        description: description ?? currentPayload.description,
        customSchedule: customSchedule ?? currentPayload.customSchedule,
      },
      status: status ?? existing.status,
    })
    .where(eq(tasksTable.id, existing.id))
    .returning();

  triggerSelfAwareness(operatorId, 'conversation_end').catch(() => {});
  res.json({
    id: updated.id,
    operatorId: updated.operatorId,
    name: updated.contextName,
    schedule: updated.taskType,
    description: (updated.payload as any)?.description ?? '',
    customSchedule: (updated.payload as any)?.customSchedule,
    status: updated.status,
    createdAt: updated.createdAt,
  });
});

router.delete('/:taskId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(and(eq(tasksTable.id, req.params.taskId), eq(tasksTable.operatorId, operatorId)));

  if (!existing) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  await db.delete(tasksTable).where(eq(tasksTable.id, existing.id));
  triggerSelfAwareness(operatorId, 'conversation_end').catch(() => {});
  res.json({ ok: true });
});

export default router;
