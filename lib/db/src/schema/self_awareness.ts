import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const selfAwarenessStateTable = pgTable('self_awareness_state', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull().unique(),
  identityState: jsonb('identity_state'),
  soulState: jsonb('soul_state'),
  capabilityState: jsonb('capability_state'),
  taskHistory: jsonb('task_history'),
  mandateGaps: text('mandate_gaps').array(),
  lastUpdated: timestamp('last_updated').defaultNow(),
  lastUpdateTrigger: text('last_update_trigger'),
});
