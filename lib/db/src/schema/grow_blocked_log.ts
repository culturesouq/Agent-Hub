import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const growBlockedLogTable = pgTable('grow_blocked_log', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  blockedFields: text('blocked_fields').array(),
  reason: text('reason').notNull(),
  proposalSummary: text('proposal_summary'),
  createdAt: timestamp('created_at').defaultNow(),
});
