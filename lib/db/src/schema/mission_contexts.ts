import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const missionContextsTable = pgTable('mission_contexts', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  name: text('name').notNull(),
  toneInstructions: text('tone_instructions'),
  kbFilter: text('kb_filter').array(),
  integrationsAllowed: text('integrations_allowed').array(),
  growLockOverride: text('grow_lock_override'),
  createdAt: timestamp('created_at').defaultNow(),
});
