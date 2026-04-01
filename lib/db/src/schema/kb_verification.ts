import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const kbVerificationRunsTable = pgTable('kb_verification_runs', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  entryId: text('entry_id').notNull(),
  runNumber: integer('run_number').notNull(),
  sourceFound: boolean('source_found').default(false),
  sourceUrl: text('source_url'),
  scoreBefore: integer('score_before'),
  scoreAfter: integer('score_after'),
  actionTaken: text('action_taken'),
  createdAt: timestamp('created_at').defaultNow(),
});
