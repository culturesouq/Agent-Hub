import { pgTable, text, real, timestamp } from 'drizzle-orm/pg-core';
import { vector } from './types.js';

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
});
