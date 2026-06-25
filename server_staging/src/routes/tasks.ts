import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db';
import { tasksTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { computeNextRunAt, validateSchedule } from '../utils/taskSchedule.js';
import { runSingleTask } from '../cron/tasksCron.js';

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

function computeInitialNextRunAt(schedule: string, customSchedule: string | null | undefined): Date | null {
  return computeNextRunAt(schedule, customSchedule ?? null, new Date());
}

const SCHEDULE_VALUES = ['hourly', 'daily', 'weekly', 'cron'] as const;

const CreateTaskSchema = z.object({
  name: z.string().min(1).max(200),
  schedule: z.enum(SCHEDULE_VALUES),
  prompt: z.string().min(1).max(2000),
  customSchedule: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  schedule: z.enum(SCHEDULE_VALUES).optional(),
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
  const scheduleErr = validateSchedule(schedule, customSchedule);
  if (scheduleErr) {
    res.status(400).json({ error: scheduleErr });
    return;
  }
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
      nextRunAt: computeInitialNextRunAt(schedule, customSchedule),
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
  const newCustom = customSchedule ?? currentPayload.customSchedule ?? null;

  if (schedule || customSchedule !== undefined) {
    const scheduleErr = validateSchedule(newSchedule, newCustom);
    if (scheduleErr) {
      res.status(400).json({ error: scheduleErr });
      return;
    }
  }

  // Recompute nextRunAt when EITHER the schedule type or the custom expression changed.
  const scheduleChanged =
    (schedule !== undefined && schedule !== existing.taskType) ||
    (customSchedule !== undefined && customSchedule !== currentPayload.customSchedule);
  const nextRunAt = scheduleChanged
    ? computeInitialNextRunAt(newSchedule, newCustom)
    : undefined;

  const updatedPayload: TaskPayload = {
    ...currentPayload,
    customSchedule: newCustom,
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

router.post('/:taskId/run-now', async (req: Request, res: Response): Promise<void> => {
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

  // Run the task inline using the same executor as the cron and the
  // run_task_now MCP tool. rescheduleAfter:false keeps the recurring
  // schedule's nextRunAt untouched — this fires extra, not instead.
  const result = await runSingleTask(existing.id, { rescheduleAfter: false });
  res.json(result);
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
