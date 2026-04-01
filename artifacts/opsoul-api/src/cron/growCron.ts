import { db } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { inArray } from 'drizzle-orm';
import { runGrowCycle } from '../utils/growEngine.js';

const GROWABLE_LOCK_LEVELS = ['OPEN', 'CONTROLLED'];

export async function runDailyGrowCycle(): Promise<void> {
  console.log('[GROW] Daily cycle starting:', new Date().toISOString());

  let operators: { id: string; name: string }[] = [];
  try {
    operators = await db
      .select({ id: operatorsTable.id, name: operatorsTable.name })
      .from(operatorsTable)
      .where(inArray(operatorsTable.growLockLevel, GROWABLE_LOCK_LEVELS));
  } catch (err) {
    console.error('[GROW] Failed to fetch operators:', (err as Error).message);
    return;
  }

  console.log(`[GROW] Processing ${operators.length} operator(s)`);

  for (const op of operators) {
    try {
      const result = await runGrowCycle(op.id);
      if (result.status === 'skipped' || result.status === 'locked_until') {
        console.log(`[GROW] ${op.name} (${op.id}): ${result.status}`);
      } else {
        console.log(
          `[GROW] ${op.name} (${op.id}): proposal=${result.proposalId} status=${result.status} ` +
          `applied=${result.changesApplied} blocked=${result.fieldsBlocked} needsReview=${result.needsOwnerReview}`,
        );
      }
    } catch (err) {
      console.error(`[GROW] Error processing operator ${op.name} (${op.id}):`, (err as Error).message);
    }
  }

  console.log('[GROW] Daily cycle complete:', new Date().toISOString());
}

export function startGrowCron(): void {
  const CRON_SCHEDULE = process.env.GROW_CRON_SCHEDULE ?? '0 2 * * *';

  console.log(`[GROW] Cron scheduled: "${CRON_SCHEDULE}" (UTC)`);

  import('node-cron').then(({ default: cron }) => {
    cron.schedule(CRON_SCHEDULE, () => {
      runDailyGrowCycle().catch((err) => {
        console.error('[GROW] Unhandled error in daily cycle:', err);
      });
    }, { timezone: 'UTC' });
  }).catch((err) => {
    console.error('[GROW] Failed to start cron — node-cron not available:', err.message);
  });
}
