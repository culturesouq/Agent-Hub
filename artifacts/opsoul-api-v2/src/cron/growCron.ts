import { db } from '@workspace/db-v2';
import { operatorsTable } from '@workspace/db-v2';
import { inArray, eq, and } from 'drizzle-orm';
import { runGrowCycle, retryPendingProposals } from '../utils/growEngine.js';

const GROWABLE_LOCK_LEVELS = ['OPEN', 'CONTROLLED'];

export async function runDailyGrowCycle(): Promise<void> {
  console.log('[GROW] Daily cycle starting:', new Date().toISOString());

  let operators: { id: string; name: string }[] = [];
  try {
    operators = await db
      .select({ id: operatorsTable.id, name: operatorsTable.name })
      .from(operatorsTable)
      .where(and(inArray(operatorsTable.growLockLevel, GROWABLE_LOCK_LEVELS), eq(operatorsTable.safeMode, false)));
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
          `applied=${result.changesApplied} blocked=${result.fieldsBlocked} ` +
          `semanticGuard=${result.semanticGuardTriggered} l1Violations=${result.layer1ViolationsBlocked}`,
        );
      }
    } catch (err) {
      console.error(`[GROW] Error processing operator ${op.name} (${op.id}):`, (err as Error).message);
    }
  }

  console.log('[GROW] Daily cycle complete:', new Date().toISOString());
}

export function startGrowCron(): void {
  const DAILY_SCHEDULE = process.env.GROW_CRON_SCHEDULE ?? '0 2 * * *';
  const RETRY_SCHEDULE = process.env.GROW_RETRY_SCHEDULE ?? '0 * * * *';

  console.log(`[GROW] Daily cron scheduled: "${DAILY_SCHEDULE}" (UTC)`);
  console.log(`[GROW] Retry cron scheduled: "${RETRY_SCHEDULE}" (UTC) — retries at 1hr/2hr/4hr, escalates to manual_review after 3 failed attempts`);

  import('node-cron').then(({ default: cron }) => {
    cron.schedule(DAILY_SCHEDULE, () => {
      runDailyGrowCycle().catch((err) => {
        console.error('[GROW] Unhandled error in daily cycle:', err);
      });
    }, { timezone: 'UTC' });

    cron.schedule(RETRY_SCHEDULE, () => {
      retryPendingProposals().catch((err) => {
        console.error('[GROW-RETRY] Unhandled error in retry cycle:', err);
      });
    }, { timezone: 'UTC' });

  }).catch((err) => {
    console.error('[GROW] Failed to start cron — node-cron not available:', err.message);
  });
}

export async function runGrowCron(): Promise<void> {
  return runDailyGrowCycle();
}
