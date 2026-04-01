import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { vector } from './types.js';

export const operatorKbTable = pgTable('operator_kb', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  ownerId: text('owner_id').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  confidenceScore: integer('confidence_score').default(40),
  verificationStatus: text('verification_status').default('pending'),
  sourceUrl: text('source_url'),
  sourceName: text('source_name'),
  sourceTrustLevel: text('source_trust_level').default('operator_self'),
  probationRunCount: integer('probation_run_count').default(0),
  lastVerifiedAt: timestamp('last_verified_at'),
  flagReason: text('flag_reason'),
  intakeTags: text('intake_tags').array().default([]),
  isPipelineIntake: boolean('is_pipeline_intake').default(false),
  privacyCleared: boolean('privacy_cleared').default(false),
  contentCleared: boolean('content_cleared').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
