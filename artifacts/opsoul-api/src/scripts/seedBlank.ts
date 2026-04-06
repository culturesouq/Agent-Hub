import { db, pool } from '@workspace/db';
import {
  operatorsTable,
  ownersTable,
} from '@workspace/db';
import { eq, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

async function run() {
  // Check if Blank already exists (including soft-deleted)
  const existing = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(eq(operatorsTable.name, 'Blank'))
    .limit(1);

  if (existing.length > 0) {
    console.log('Blank already exists — id:', existing[0].id);
    await pool.end();
    return;
  }

  // Find first sovereign admin owner
  const owners = await db
    .select({ id: ownersTable.id })
    .from(ownersTable)
    .where(eq(ownersTable.isSovereignAdmin, true))
    .limit(1);

  if (owners.length === 0) {
    console.error('No sovereign admin found — cannot seed Blank');
    await pool.end();
    process.exit(1);
  }

  const ownerId = owners[0].id;
  const newId = randomUUID();

  await db.insert(operatorsTable).values({
    id: newId,
    ownerId,
    slug: 'blank',
    name: 'Blank',
    archetype: [],
    mandate: 'A clean foundation. No archetype. No predefined purpose. Built to observe, learn, and become.',
    coreValues: [],
    ethicalBoundaries: [],
    layer2Soul: {},
    layer2SoulOriginal: {},
    growLockLevel: 'OPEN',
    safeMode: false,
    freeRoaming: true,
    toolUsePolicy: 'auto',
    deletedAt: null,
  });

  console.log(`Blank operator inserted — id: ${newId}`);

  // Trigger self-awareness snapshot via running API
  const port = process.env.PORT ?? '3000';
  try {
    const res = await fetch(
      `http://localhost:${port}/api/operators/${newId}/recompute-awareness`,
      { method: 'POST' },
    );
    if (res.ok) {
      console.log('triggerSelfAwareness(force) called successfully');
    } else {
      console.warn(`recompute-awareness returned HTTP ${res.status} — snapshot will be created on first use`);
    }
  } catch (err: any) {
    console.warn('recompute-awareness HTTP call failed (API may not be running) — snapshot will be created on first use:', err?.message);
  }

  await pool.end();
}

run().catch(err => {
  console.error(err);
  pool.end().catch(() => {});
  process.exit(1);
});
