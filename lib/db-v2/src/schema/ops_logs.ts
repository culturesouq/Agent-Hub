import { pgSchema, text, integer, timestamp } from 'drizzle-orm/pg-core';

const v3Schema = pgSchema('opsoul_v3');

export const opsLogsTable = v3Schema.table('ops_logs', {
  id: text('id').primaryKey(),
  logTier: text('log_tier').notNull(),
  errorType: text('error_type').notNull(),
  operatorId: text('operator_id'),
  layerFailed: text('layer_failed'),
  integration: text('integration'),
  skill: text('skill'),
  retryCount: integer('retry_count').default(0),
  fixOutcome: text('fix_outcome'),
  createdAt: timestamp('created_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});
