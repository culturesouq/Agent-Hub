import { pgTable, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const ragPipelineConfigTable = pgTable('rag_pipeline_config', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  enabled: boolean('enabled').default(false),
  minConfidenceScore: integer('min_confidence_score').default(70),
  deduplicationThreshold: integer('deduplication_threshold').default(92),
  scopeFilter: text('scope_filter').array().default([]),
  lastRunAt: timestamp('last_run_at'),
  lastRunCount: integer('last_run_count').default(0),
  totalExtracted: integer('total_extracted').default(0),
  updatedAt: timestamp('updated_at').defaultNow(),
});
