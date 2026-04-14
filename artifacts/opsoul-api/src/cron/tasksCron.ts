import { db } from '@workspace/db';
import { tasksTable, operatorsTable } from '@workspace/db';
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import { chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { storeMemory } from '../utils/memoryEngine.js';
import type { Layer2Soul } from '../validation/operator.js';

function computeNextRunAt(schedule: string, from: Date): Date | null {
  if (schedule === 'daily')  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
  if (schedule === 'weekly') return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  return null;
}

async function runDueTasks(): Promise<void> {
  const now = new Date();

  const dueTasks = await db
    .select()
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
    const startTime = Date.now();

    try {
      const [operator] = await db
        .select()
        .from(operatorsTable)
        .where(eq(operatorsTable.id, task.operatorId));

      if (!operator) {
        console.warn(`[TASKS] Operator ${task.operatorId} not found for task ${task.id} — skipping`);
        continue;
      }

      const prompt = (task.payload as any)?.description ?? '';
      if (!prompt) {
        console.warn(`[TASKS] Task ${task.id} has no prompt — skipping`);
        continue;
      }

      const systemPromptText = buildSystemPrompt({
        name:               operator.name ?? 'Operator',
        rawIdentity:        operator.rawIdentity,
        archetype:          (operator.layer2Soul as any)?.archetype ?? [],
        mandate:            (operator.layer2Soul as any)?.mandate ?? '',
        coreValues:         (operator.layer2Soul as any)?.coreValues ?? null,
        ethicalBoundaries:  (operator.layer2Soul as any)?.ethicalBoundaries ?? null,
        layer2Soul:         operator.layer2Soul as Layer2Soul,
      });

      const result = await chatCompletion(
        [
          { role: 'system', content: systemPromptText },
          { role: 'user',   content: `[SCHEDULED TASK: ${task.contextName}]\n${prompt}` },
        ],
        CHAT_MODEL,
      );

      const output = result.content?.trim() ?? '';
      const durationSec = (Date.now() - startTime) / 1000;
      const summary = output.slice(0, 300);

      if (output) {
        await storeMemory(
          operator.id,
          operator.ownerId,
          `[Scheduled task: ${task.contextName}] ${summary}`,
          'context',
          'ai_distilled',
          0.8,
          false,
        );
      }

      const nextRunAt = computeNextRunAt(task.taskType, now);

      await db.update(tasksTable)
        .set({
          nextRunAt,
          payload: {
            ...(task.payload as object),
            lastRunAt: now.toISOString(),
            lastRunSummary: summary,
            lastRunDurationSec: parseFloat(durationSec.toFixed(1)),
          },
        })
        .where(eq(tasksTable.id, task.id));

      console.log(`[TASKS] Task "${task.contextName}" (${task.id}) completed in ${durationSec.toFixed(1)}s`);

    } catch (err) {
      console.error(`[TASKS] Task ${task.id} failed:`, (err as Error).message);
      const nextRunAt = computeNextRunAt(task.taskType, now);
      await db.update(tasksTable)
        .set({
          nextRunAt,
          payload: {
            ...(task.payload as object),
            lastRunAt: now.toISOString(),
            lastRunSummary: `Error: ${(err as Error).message?.slice(0, 200)}`,
            lastRunDurationSec: parseFloat(((Date.now() - startTime) / 1000).toFixed(1)),
          },
        })
        .where(eq(tasksTable.id, task.id));
    }
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
