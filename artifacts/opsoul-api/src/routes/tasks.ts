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

interface TaskPayload {
  customSchedule?: string | null;
  lastRunSummary?: string | null;
  lastRunDurationSec?: number | null;
  /** Legacy — kept for backward compatibility with rows created before the prompt column. */
  description?: string | null;
}

function parseTaskPayload(raw: unknown): TaskPayload {
  if (raw === null || raw === undefined || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  return {
    customSchedule:    typeof r.customSchedule === 'string'    ? r.customSchedule    : null,
    lastRunSummary:    typeof r.lastRunSummary  === 'string'    ? r.lastRunSummary    : null,
    lastRunDurationSec: typeof r.lastRunDurationSec === 'number' ? r.lastRunDurationSec : null,
    description:       typeof r.description    === 'string'    ? r.description       : null,
  };
}

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId as string),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op.id;
}

function computeInitialNextRunAt(schedule: string): Date | null {
  const now = Date.now();
  if (schedule === 'daily')  return new Date(now + 24 * 60 * 60 * 1000);
  if (schedule === 'weekly') return new Date(now + 7 * 24 * 60 * 60 * 1000);
  return null;
}

const CreateTaskSchema = z.object({
  name: z.string().min(1).max(200),
  schedule: z.enum(['daily', 'weekly', 'custom']),
  prompt: z.string().min(1).max(2000),
  customSchedule: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  schedule: z.enum(['daily', 'weekly', 'custom']).optional(),
  prompt: z.string().min(1).max(2000).optional(),
  customSchedule: z.string().optional(),
  status: z.enum(['active', 'paused']).optional(),
});

function serializeTask(r: typeof tasksTable.$inferSelect) {
  const payload = parseTaskPayload(r.payload);
  return {
    id: r.id,
    operatorId: r.operatorId,
    name: r.contextName,
    schedule: r.taskType,
    prompt: r.prompt ?? payload.description ?? '',
    customSchedule: payload.customSchedule ?? null,
    status: r.status ?? 'active',
    nextRunAt: r.nextRunAt,
    lastRunAt: r.lastRunAt ?? null,
    lastRunSummary: payload.lastRunSummary ?? null,
    lastRunDurationSec: payload.lastRunDurationSec ?? null,
    createdAt: r.createdAt,
  };
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const rows = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.operatorId, operatorId))
    .orderBy(desc(tasksTable.createdAt));

  res.json({ tasks: rows.map(serializeTask) });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { name, schedule, prompt, customSchedule } = parsed.data;
  const payload: TaskPayload = { customSchedule: customSchedule ?? null };

  const [created] = await db
    .insert(tasksTable)
    .values({
      id: crypto.randomUUID(),
      operatorId,
      contextName: name,
      taskType: schedule,
      integrationLabel: 'automation',
      prompt,
      payload,
      status: 'active',
      nextRunAt: computeInitialNextRunAt(schedule),
    })
    .returning();

  triggerSelfAwareness(operatorId, 'conversation_end').catch(() => {});
  res.status(201).json(serializeTask(created));
});

router.patch('/:taskId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.id, req.params.taskId as string), eq(tasksTable.operatorId, operatorId)));

  if (!existing) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const parsed = UpdateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { name, schedule, prompt, customSchedule, status } = parsed.data;
  const currentPayload = parseTaskPayload(existing.payload);

  const newSchedule = schedule ?? existing.taskType;
  const nextRunAt = schedule && schedule !== existing.taskType
    ? computeInitialNextRunAt(schedule)
    : undefined;

  const updatedPayload: TaskPayload = {
    ...currentPayload,
    customSchedule: customSchedule ?? currentPayload.customSchedule,
  };

  const [updated] = await db
    .update(tasksTable)
    .set({
      contextName: name ?? existing.contextName,
      taskType: newSchedule,
      prompt: prompt ?? existing.prompt,
      payload: updatedPayload,
      status: status ?? existing.status,
      ...(nextRunAt !== undefined ? { nextRunAt } : {}),
    })
    .where(eq(tasksTable.id, existing.id))
    .returning();

  triggerSelfAwareness(operatorId, 'conversation_end').catch(() => {});
  res.json(serializeTask(updated));
});

router.delete('/:taskId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(and(eq(tasksTable.id, req.params.taskId as string), eq(tasksTable.operatorId, operatorId)));

  if (!existing) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  await db.delete(tasksTable).where(eq(tasksTable.id, existing.id));
  triggerSelfAwareness(operatorId, 'conversation_end').catch(() => {});
  res.json({ ok: true });
});

export default router;
