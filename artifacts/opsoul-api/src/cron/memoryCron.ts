import { decayMemoriesForOperator } from '../utils/memoryEngine.js';

export async function runDailyMemoryDecay(): Promise<void> {
  console.log('[MEMORY] Decay cycle starting:', new Date().toISOString());

  try {
    const result = await decayMemoriesForOperator();
    console.log(
      `[MEMORY] Decay complete — decayed: ${result.decayed}, auto-archived: ${result.archived}`,
    );
  } catch (err) {
    console.error('[MEMORY] Decay cycle failed:', (err as Error).message);
  }
}

export function startMemoryCron(): void {
  const DECAY_SCHEDULE = process.env.MEMORY_DECAY_SCHEDULE ?? '0 3 * * *';

  console.log(`[MEMORY] Decay cron scheduled: "${DECAY_SCHEDULE}" (UTC) — rate: -0.05/day, archive at ≤0.05`);

  import('node-cron').then(({ default: cron }) => {
    cron.schedule(DECAY_SCHEDULE, () => {
      runDailyMemoryDecay().catch((err) => {
        console.error('[MEMORY] Unhandled error in decay cycle:', err);
      });
    }, { timezone: 'UTC' });
  }).catch((err) => {
    console.error('[MEMORY] Failed to start decay cron — node-cron not available:', err.message);
  });
}
