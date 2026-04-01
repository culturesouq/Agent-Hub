import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const growProposalsTable = pgTable('grow_proposals', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  proposedChanges: jsonb('proposed_changes').notNull(),
  selfAwarenessSnapshot: jsonb('self_awareness_snapshot'),
  claudeEvaluation: jsonb('claude_evaluation'),
  claudeReasoning: text('claude_reasoning'),
  status: text('status').default('queued'),
  retryCount: integer('retry_count').default(0),
  lastRetryAt: timestamp('last_retry_at'),
  ownerDecision: text('owner_decision'),
  createdAt: timestamp('created_at').defaultNow(),
  evaluatedAt: timestamp('evaluated_at'),
  decidedAt: timestamp('decided_at'),
});
