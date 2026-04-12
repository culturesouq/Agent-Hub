import { pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

const v3Schema = pgSchema('opsoul_v3');

export const growBlockedLogTable = v3Schema.table('grow_blocked_log', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  blockedFields: text('blocked_fields').array(),
  reason: text('reason').notNull(),
  proposalSummary: text('proposal_summary'),
  createdAt: timestamp('created_at').defaultNow(),
});
