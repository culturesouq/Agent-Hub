/**
 * Dynamic resolver for the Vael operator's id.
 *
 * Why this exists: prior code hardcoded `VAEL_OPERATOR_ID = 'a826164f-...'`
 * in three files (memoryEngine.ts, seedVaelScopingKb.ts, vaelCron.ts). At
 * some point Vael was recreated with a new id (current real id:
 * `8668f6c9-f7cf-4c65-a36e-7dd278005950`) but the constants were not
 * updated. The cron and seed scripts have been silently no-op-ing against
 * a non-existent operator since; the memory-engine "don't promote Vael's
 * own memories to platform candidates" guard has been silently skipping
 * the wrong id, so the REAL Vael's distilled memories were being marked
 * platform-eligible incorrectly.
 *
 * Fix: look up Vael by name='Vael' from the operators table at startup.
 * Cache the result for the process lifetime. If multiple operators ever
 * share the name (they shouldn't), prefer the oldest by created_at.
 *
 * Override: if the env var VAEL_OPERATOR_ID is set, use that — lets owners
 * pin a specific operator if they ever maintain multiple Vael-like agents.
 */

import { db } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { eq, asc } from 'drizzle-orm';

let cachedId: string | null = null;
let resolutionPromise: Promise<string | null> | null = null;

export async function getVaelOperatorId(): Promise<string | null> {
  if (cachedId) return cachedId;

  if (process.env.VAEL_OPERATOR_ID) {
    cachedId = process.env.VAEL_OPERATOR_ID;
    return cachedId;
  }

  // De-dupe concurrent callers — at most one DB query in flight.
  if (resolutionPromise) return resolutionPromise;

  resolutionPromise = (async () => {
    try {
      const rows = await db
        .select({ id: operatorsTable.id })
        .from(operatorsTable)
        .where(eq(operatorsTable.name, 'Vael'))
        .orderBy(asc(operatorsTable.createdAt))
        .limit(1);
      const id = rows[0]?.id ?? null;
      if (id) {
        cachedId = id;
      } else {
        console.warn('[vaelOperatorId] no operator named "Vael" found in DB. Vael cron + seed + memory-promotion guard will skip.');
      }
      return id;
    } catch (err) {
      console.warn('[vaelOperatorId] lookup failed:', err);
      return null;
    } finally {
      resolutionPromise = null;
    }
  })();

  return resolutionPromise;
}

/**
 * Synchronous best-effort accessor. Returns the cached id or null if not
 * yet resolved. Use only in code paths that have already awaited
 * `getVaelOperatorId()` at least once.
 */
export function getVaelOperatorIdCached(): string | null {
  return cachedId;
}

/**
 * Test/admin helper: clears the cache so the next call re-resolves.
 */
export function resetVaelOperatorIdCache(): void {
  cachedId = null;
  resolutionPromise = null;
}
