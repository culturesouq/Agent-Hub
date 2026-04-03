import { pgTable, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const operatorsTable = pgTable('operators', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  archetype: text('archetype').array().notNull(),
  mandate: text('mandate').notNull(),
  coreValues: text('core_values').array(),
  ethicalBoundaries: text('ethical_boundaries').array(),
  rawIdentity: text('raw_identity'),
  layer1LockedAt: timestamp('layer1_locked_at'),
  layer2Soul: jsonb('layer2_soul').notNull(),
  layer2SoulOriginal: jsonb('layer2_soul_original').notNull(),
  growLockLevel: text('grow_lock_level').default('CONTROLLED'),
  lockedUntil: timestamp('locked_until'),
  safeMode: boolean('safe_mode').default(false),
  toolUsePolicy: jsonb('tool_use_policy').default({}),
  openrouterApiKey: text('openrouter_api_key'),
  defaultModel: text('default_model'),
  createdAt: timestamp('created_at').defaultNow(),
});
