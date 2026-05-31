import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { vector } from './types';

export const ownerKbTable = pgTable('owner_kb', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  ownerId: text('owner_id').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  sourceUrl: text('source_url'),
  sourceName: text('source_name'),
  sourceType: text('source_type').default('manual'),
  chunkIndex: integer('chunk_index'),
  // SRAG entity classification — every entry is one of the canonical six
  // entity types so retrieval can filter on shape, not just on text match.
  // Owner UI requires this on every write (KbSection dialog).
  entityType: text('entity_type').default('reference'),
  // SRAG retrieval handles — REQUIRED on every owner_kb write per
  // [[srag]] discipline. Enforced at the route layer; column itself is
  // text[] for free-form classification.
  intakeTags: text('intake_tags').array().default([]),
  createdAt: timestamp('created_at').defaultNow(),
});
