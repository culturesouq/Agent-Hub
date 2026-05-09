import { pgTable, text, real, boolean, timestamp } from 'drizzle-orm/pg-core';
import { vector } from './types';

/**
 * Layer 2 — OpSoul main memory.
 * PII-free insights extracted from all scopes.
 * Never contains user names, business names, or any identifying information.
 * Eligible for GROW after confidence ≥ 0.80 and full guard chain.
 */
export const operatorMainMemoryTable = pgTable('operator_main_memory', {
  id:             text('id').primaryKey(),
  operatorId:     text('operator_id').notNull(),
  ownerId:        text('owner_id').notNull(),
  content:        text('content').notNull(),
  embedding:      vector('embedding', { dimensions: 1536 }),
  memoryType:     text('memory_type').notNull(),
  confidence:     real('confidence').notNull().default(0.80),
  sourceScope:    text('source_scope').notNull(),
  weight:         real('weight').notNull().default(1.0),
  decayStartedAt: timestamp('decay_started_at'),
  archivedAt:     timestamp('archived_at'),
  growEligible:         boolean('grow_eligible').notNull().default(true),
  growUsedAt:           timestamp('grow_used_at'),
  platformCandidate:    boolean('platform_candidate').notNull().default(false),
  platformReviewedAt:   timestamp('platform_reviewed_at'),
  platformVerdict:      text('platform_verdict'), // 'approved' | 'rejected'
  createdAt:            timestamp('created_at').defaultNow(),
});
