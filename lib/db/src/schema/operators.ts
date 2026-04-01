import { pgTable, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const operatorsTable = pgTable('operators', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  archetype: text('archetype').notNull(),
  mandate: text('mandate').notNull(),
  coreValues: text('core_values').array(),
  ethicalBoundaries: text('ethical_boundaries').array(),
  layer1LockedAt: timestamp('layer1_locked_at').default(undefined),
  layer2Soul: jsonb('layer2_soul').notNull(),
  layer2SoulOriginal: jsonb('layer2_soul_original').notNull(),
  growLockLevel: text('grow_lock_level').default('CONTROLLED'),
  lockedUntil: timestamp('locked_until').default(undefined),
  safeMode: boolean('safe_mode').default(false),
  toolUsePolicy: jsonb('tool_use_policy').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});
