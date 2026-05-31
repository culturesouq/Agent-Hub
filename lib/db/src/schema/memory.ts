import { pgTable, text, real, boolean, timestamp } from 'drizzle-orm/pg-core';
import { vector } from './types';

export const operatorMemoryTable = pgTable('operator_memory', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  ownerId: text('owner_id').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  memoryType: text('memory_type').notNull(),
  sourceTrustLevel: text('source_trust_level').default('user'),
  weight: real('weight').default(1.0),
  decayStartedAt: timestamp('decay_started_at'),
  archivedAt: timestamp('archived_at'),
  createdAt: timestamp('created_at').defaultNow(),
  scopeId:    text('scope_id').notNull().default('legacy'),
  scopeTrust: text('scope_trust').default('owner'),
  /**
   * Soul-anchor decay exemption (Claim 25). Rows marked true are skipped by
   * the decay sweep — identity-critical memories the operator (or GROW)
   * has flagged as part of its core self. Default false; promotion to true
   * is explicit. DDL ensured at startup via setupDatabase().
   */
  soulAnchored: boolean('soul_anchored').notNull().default(false),
});
