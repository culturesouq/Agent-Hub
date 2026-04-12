import crypto from 'crypto';
import { db } from '@workspace/db-v2';
import {
  operatorsTable,
  selfAwarenessStateTable,
  opsLogsTable,
} from '@workspace/db-v2';
import { eq, isNotNull, isNull } from 'drizzle-orm';
import { semanticDistance } from '@workspace/opsoul-utils/ai';
import type { Layer2Soul } from '../utils/systemPrompt.js';

async function captureBaselines(): Promise<void> {
  const unbaselined = await db
    .select({
      id: operatorsTable.id,
      name: operatorsTable.name,
      layer2Soul: operatorsTable.layer2Soul,
    })
    .from(operatorsTable)
    .where(isNull(operatorsTable.layer2SoulOriginal));

  if (unbaselined.length === 0) return;

  console.log(`[DRIFT] Capturing soul baseline for ${unbaselined.length} operator(s) with no original snapshot`);

  for (const op of unbaselined) {
    try {
      await db
        .update(operatorsTable)
        .set({ layer2SoulOriginal: op.layer2Soul })
        .where(eq(operatorsTable.id, op.id));
      console.log(`[DRIFT] Baseline saved for ${op.name} (${op.id})`);
    } catch (err) {
      console.error(`[DRIFT] Failed to save baseline for ${op.name} (${op.id}):`, (err as Error).message);
    }
  }
}

export async function computeSoulDrift(operatorId: string): Promise<{
  driftScore: number;
  measuredAt: string;
}> {
  const [op] = await db
    .select({
      id: operatorsTable.id,
      layer2Soul: operatorsTable.layer2Soul,
      layer2SoulOriginal: operatorsTable.layer2SoulOriginal,
    })
    .from(operatorsTable)
    .where(eq(operatorsTable.id, operatorId));

  if (!op) throw new Error(`Operator ${operatorId} not found`);
  if (!op.layer2SoulOriginal) throw new Error(`No original soul snapshot for operator ${operatorId}`);

  const currentText = soulToText(op.layer2Soul as Layer2Soul);
  const originalText = soulToText(op.layer2SoulOriginal as Layer2Soul);

  const driftScore = await semanticDistance(originalText, currentText);
  return { driftScore, measuredAt: new Date().toISOString() };
}

async function runDriftCheck(): Promise<void> {
  console.log('[DRIFT] 90-day cumulative drift check starting:', new Date().toISOString());

  await captureBaselines();

  const operators = await db
    .select({
      id: operatorsTable.id,
      name: operatorsTable.name,
      layer2Soul: operatorsTable.layer2Soul,
    })
    .from(operatorsTable)
    .where(isNotNull(operatorsTable.layer2SoulOriginal));

  console.log(`[DRIFT] Checking ${operators.length} operator(s)`);

  for (const op of operators) {
    try {
      const { driftScore, measuredAt } = await computeSoulDrift(op.id);
      const currentText = soulToText(op.layer2Soul as Layer2Soul);

      const flagged = driftScore > 0.30;

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
              measuredAt,
              driftFlagged: flagged,
            },
          })
          .where(eq(selfAwarenessStateTable.id, existing.id));
      } else {
        await db.insert(selfAwarenessStateTable).values({
          id: crypto.randomUUID(),
          operatorId: op.id,
          soulState: { driftScore, measuredAt, driftFlagged: flagged },
        });
      }

      if (flagged) {
        console.log(
          `[DRIFT] ${op.name} (${op.id}): drift score ${driftScore.toFixed(3)} — flagged, inserting ops_log`
        );

        try {
          await db.insert(opsLogsTable).values({
            id: crypto.randomUUID(),
            logTier: 'warn',
            errorType: 'soul_drift_flagged',
            operatorId: op.id,
            fixOutcome: `drift_score:${driftScore}`,
            retryCount: 0,
            createdAt: new Date(),
          });
          console.log(`[DRIFT] ${op.name}: ops_log row inserted (drift_score: ${driftScore})`);
        } catch (err) {
          console.error(`[DRIFT] ${op.name}: ops_log insert failed —`, (err as Error).message);
        }

        try {
          const { curiositySearch } = await import('../utils/curiosityEngine.js');
          const claim = `Current behavior and values of an AI operator: ${currentText.slice(0, 300)}`;
          const curiosity = await curiositySearch(claim, op.id);

          if (curiosity.verified && curiosity.corroborated) {
            const { storeMemory } = await import('../utils/memoryEngine.js');
            await storeMemory(
              op.id,
              op.id,
              `Drift correction — external sources suggest: ${curiosity.sources[0]?.snippet ?? curiosity.bestSource}`,
              'pattern',
              'ai_distilled',
              0.6,
            );
            console.log(
              `[DRIFT] ${op.name}: curiosity correction stored (tier: ${curiosity.tier}, source: ${curiosity.bestSource})`
            );
          } else {
            console.log(
              `[DRIFT] ${op.name}: curiosity fired but no corroborated source found — drift remains flagged`
            );
          }
        } catch (err) {
          console.error(`[DRIFT] ${op.name}: curiosity search failed —`, (err as Error).message);
        }
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
  const SCHEDULE = '0 3 1 */3 *';
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
