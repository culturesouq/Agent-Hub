import { db } from '@workspace/db';
import { operatorsTable, selfAwarenessStateTable } from '@workspace/db';
import { eq, isNotNull } from 'drizzle-orm';
import { semanticDistance } from '@workspace/opsoul-utils/ai';
import type { Layer2Soul } from '../validation/operator.js';

// T8 — Cumulative Drift: compute semantic drift between original and current soul
async function runDriftCheck(): Promise<void> {
  console.log('[DRIFT] 90-day cumulative drift check starting:', new Date().toISOString());

  const operators = await db
    .select({
      id: operatorsTable.id,
      name: operatorsTable.name,
      layer2Soul: operatorsTable.layer2Soul,
      layer2SoulOriginal: operatorsTable.layer2SoulOriginal,
    })
    .from(operatorsTable)
    .where(isNotNull(operatorsTable.layer2SoulOriginal));

  console.log(`[DRIFT] Checking ${operators.length} operator(s)`);

  for (const op of operators) {
    try {
      const current = op.layer2Soul as Layer2Soul;
      const original = op.layer2SoulOriginal as Layer2Soul;

      // Represent each soul as a prose description for embedding comparison
      const currentText = soulToText(current);
      const originalText = soulToText(original);

      const distance = await semanticDistance(originalText, currentText);
      const driftScore = Math.round(distance * 100);

      const flagged = driftScore > 30;

      // Store in self_awareness_state.soulState (merged with existing)
      const [existing] = await db
        .select({ id: selfAwarenessStateTable.id, soulState: selfAwarenessStateTable.soulState })
        .from(selfAwarenessStateTable)
        .where(eq(selfAwarenessStateTable.operatorId, op.id));

      if (existing) {
        const existingSoulState = (existing.soulState as Record<string, unknown>) ?? {};
        await db
          .update(selfAwarenessStateTable)
          .set({
            soulState: {
              ...existingSoulState,
              driftScore,
              driftFlagged: flagged,
              driftCheckedAt: new Date().toISOString(),
            },
          })
          .where(eq(selfAwarenessStateTable.id, existing.id));
      }

      if (flagged) {
        console.log(`[DRIFT] ${op.name} (${op.id}): drift score ${driftScore} — flagged for owner review`);
      } else {
        console.log(`[DRIFT] ${op.name} (${op.id}): drift score ${driftScore} — within normal range`);
      }
    } catch (err) {
      console.error(`[DRIFT] Error processing ${op.name} (${op.id}):`, (err as Error).message);
    }
  }

  console.log('[DRIFT] Drift check complete:', new Date().toISOString());
}

function soulToText(soul: Layer2Soul): string {
  const parts: string[] = [];
  if (soul.personalityTraits?.length) parts.push(`Personality: ${soul.personalityTraits.join(', ')}`);
  if (soul.toneProfile) parts.push(`Tone: ${soul.toneProfile}`);
  if (soul.communicationStyle) parts.push(`Style: ${soul.communicationStyle}`);
  if (soul.emotionalRange) parts.push(`Emotional range: ${soul.emotionalRange}`);
  if (soul.decisionMakingStyle) parts.push(`Decision making: ${soul.decisionMakingStyle}`);
  if (soul.conflictResolution) parts.push(`Conflict resolution: ${soul.conflictResolution}`);
  if (soul.quirks?.length) parts.push(`Quirks: ${soul.quirks.join('; ')}`);
  return parts.join('. ');
}

export function startDriftCron(): void {
  const SCHEDULE = '0 3 1 */3 *'; // 03:00 UTC on the 1st day, every 3 months
  console.log(`[DRIFT] Cumulative drift cron scheduled: "${SCHEDULE}" (UTC) — every 90 days`);

  import('node-cron').then(({ default: cron }) => {
    cron.schedule(SCHEDULE, () => {
      runDriftCheck().catch((err) => {
        console.error('[DRIFT] Unhandled error in drift check:', err);
      });
    }, { timezone: 'UTC' });
  }).catch((err) => {
    console.error('[DRIFT] Failed to start drift cron:', err.message);
  });
}
