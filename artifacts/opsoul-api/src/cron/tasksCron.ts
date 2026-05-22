import { db } from '@workspace/db';
import { tasksTable, operatorsTable } from '@workspace/db';
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import { assembleOperatorPrompt } from '../utils/systemPrompt.js';
import { CHAT_MODEL } from '../utils/openrouter.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { storeMemory, searchMemory } from '../utils/memoryEngine.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { computeNextRunAt as computeNext } from '../utils/taskSchedule.js';
import {
  loadOperatorSkills,
  runCapabilityLoop,
  type ChatMessage,
} from '../utils/operatorCapabilityLoop.js';

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
    customSchedule:     typeof r.customSchedule     === 'string'  ? r.customSchedule     : null,
    lastRunSummary:     typeof r.lastRunSummary      === 'string'  ? r.lastRunSummary      : null,
    lastRunDurationSec: typeof r.lastRunDurationSec  === 'number'  ? r.lastRunDurationSec  : null,
    description:        typeof r.description         === 'string'  ? r.description         : null,
  };
}

function computeNextRunAt(schedule: string, from: Date, customSchedule?: string | null): Date | null {
  return computeNext(schedule, customSchedule ?? null, from);
}

/**
 * Execute one task end-to-end. Extracted from the cron loop so the same
 * code path runs whether the trigger is the hourly cron, the new MCP
 * `run_task_now` tool, or the upcoming `/run-now` HTTP route.
 *
 * Returns a short summary for callers that want to relay status. The full
 * lastRunSummary (300 chars) is also written to the task row.
 */
export async function runSingleTask(
  taskId: string,
  options: { rescheduleAfter: boolean } = { rescheduleAfter: true },
): Promise<{ ok: boolean; summary: string; durationSec: number }> {
  const startTime = Date.now();
  const now = new Date();

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) return { ok: false, summary: `Task ${taskId} not found`, durationSec: 0 };

  try {
    const [operator] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, task.operatorId));
    if (!operator) {
      await db.update(tasksTable).set({ status: 'paused' }).where(eq(tasksTable.id, task.id));
      return { ok: false, summary: `Operator ${task.operatorId} not found — task paused`, durationSec: 0 };
    }

    const payload = parseTaskPayload(task.payload);
    const taskPrompt = task.prompt ?? payload.description ?? '';
    if (!taskPrompt) {
      if (options.rescheduleAfter) {
        const nextRunAt = computeNextRunAt(task.taskType, now, parseTaskPayload(task.payload).customSchedule);
        await db.update(tasksTable).set({ nextRunAt }).where(eq(tasksTable.id, task.id));
      }
      return { ok: false, summary: 'No prompt on task — skipped', durationSec: 0 };
    }

    const systemPromptText = assembleOperatorPrompt(operator);
    const taskEmbedding = await embed(taskPrompt);

    const [memoryHits, kbHits, skills] = await Promise.all([
      searchMemory(operator.id, taskEmbedding),
      searchBothKbs(operator.id, taskEmbedding, 4, 0.3, (operator.archetype as string[]) ?? []),
      loadOperatorSkills(operator.id),
    ]);

    const messages: ChatMessage[] = [{ role: 'system', content: systemPromptText }];

    if (kbHits.length > 0) {
      messages.push({ role: 'user',      content: `[CONTEXT]\nKnowledge retrieved for this task:\n${buildRagContext(kbHits)}` });
      messages.push({ role: 'assistant', content: 'Understood. I have absorbed the relevant knowledge.' });
    }

    if (memoryHits.length > 0) {
      const memCtx = memoryHits.map(m => `[${m.memoryType}] ${m.content}`).join('\n');
      messages.push({ role: 'user',      content: `[CONTEXT]\nMemory recalled from past conversations:\n${memCtx}` });
      messages.push({ role: 'assistant', content: 'Understood. I remember this context.' });
    }

    messages.push({ role: 'user', content: `[SCHEDULED TASK: ${task.contextName}]\n${taskPrompt}` });

    const { content, skillFired, skillName } = await runCapabilityLoop(
      messages,
      `[SCHEDULED TASK: ${task.contextName}] ${taskPrompt}`,
      skills,
      CHAT_MODEL,
      operator.id,
      operator.ownerId,
    );

    const durationSec = (Date.now() - startTime) / 1000;
    const summary = content.slice(0, 300);

    if (content) {
      await storeMemory(
        operator.id,
        operator.ownerId,
        `[Scheduled task: ${task.contextName}${skillFired ? ` (skill: ${skillName})` : ''}] ${summary}`,
        'context',
        'ai_distilled',
        0.8,
        false,
      );
    }

    const nextRunAt = options.rescheduleAfter ? computeNextRunAt(task.taskType, now, parseTaskPayload(task.payload).customSchedule) : task.nextRunAt;
    const updatedPayload: TaskPayload = {
      ...payload,
      lastRunSummary:     summary,
      lastRunDurationSec: parseFloat(durationSec.toFixed(1)),
    };

    await db.update(tasksTable)
      .set({ nextRunAt, lastRunAt: now, payload: updatedPayload })
      .where(eq(tasksTable.id, task.id));

    console.log(
      `[TASKS] Task "${task.contextName}" (${task.id}) completed in ${durationSec.toFixed(1)}s` +
      (skillFired ? ` [skill: ${skillName}]` : ''),
    );

    return { ok: true, summary, durationSec };
  } catch (err) {
    const durationSec = (Date.now() - startTime) / 1000;
    const errorMsg = (err as Error).message;
    console.error(`[TASKS] Task ${task.id} failed:`, errorMsg);
    const payload = parseTaskPayload(task.payload);
    const errorPayload: TaskPayload = {
      ...payload,
      lastRunSummary:     `Error: ${errorMsg?.slice(0, 200)}`,
      lastRunDurationSec: parseFloat(durationSec.toFixed(1)),
    };
    const nextRunAt = options.rescheduleAfter ? computeNextRunAt(task.taskType, now, parseTaskPayload(task.payload).customSchedule) : task.nextRunAt;
    await db.update(tasksTable)
      .set({ nextRunAt, lastRunAt: now, payload: errorPayload })
      .where(eq(tasksTable.id, task.id));
    return { ok: false, summary: `Error: ${errorMsg}`, durationSec };
  }
}

async function runDueTasks(): Promise<void> {
  const now = new Date();

  const dueTasks = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.status, 'active'),
        isNotNull(tasksTable.nextRunAt),
        lte(tasksTable.nextRunAt, now),
      ),
    );

  if (dueTasks.length === 0) return;

  console.log(`[TASKS] ${dueTasks.length} task(s) due at ${now.toISOString()}`);

  for (const task of dueTasks) {
    await runSingleTask(task.id, { rescheduleAfter: true });
  }
}

export function startTasksCron(): void {
  const TASKS_SCHEDULE = '0 * * * *';

  console.log(`[TASKS] Execution cron scheduled: "${TASKS_SCHEDULE}" (UTC) — runs due automations hourly`);

  import('node-cron').then(({ default: cron }) => {
    cron.schedule(TASKS_SCHEDULE, () => {
      runDueTasks().catch((err) => {
        console.error('[TASKS] Unhandled error in tasks cycle:', err);
      });
    }, { timezone: 'UTC' });
  }).catch((err) => {
    console.error('[TASKS] Failed to start tasks cron:', err.message);
  });
}
