import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const supportTicketsTable = pgTable('support_tickets', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id'),
  ownerId: text('owner_id').notNull(),
  issueSummary: text('issue_summary').notNull(),
  supportOperatorTranscript: text('support_operator_transcript'),
  status: text('status').default('open'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});
