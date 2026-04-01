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
  createdAt: timestamp('created_at').defaultNow(),
});
