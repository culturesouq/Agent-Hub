import { db } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

export async function lockLayer1IfUnlocked(operatorId: string): Promise<{ wasLocked: boolean; lockedAt: Date | null }> {
  const [op] = await db
    .select({ id: operatorsTable.id, layer1LockedAt: operatorsTable.layer1LockedAt })
    .from(operatorsTable)
    .where(eq(operatorsTable.id, operatorId));

  if (!op) throw new Error(`Operator ${operatorId} not found`);
  if (op.layer1LockedAt !== null) return { wasLocked: false, lockedAt: op.layer1LockedAt };

  const now = new Date();
  await db.update(operatorsTable).set({ layer1LockedAt: now }).where(eq(operatorsTable.id, operatorId));

  return { wasLocked: true, lockedAt: now };
}
