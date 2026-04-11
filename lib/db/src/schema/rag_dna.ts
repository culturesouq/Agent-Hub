import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vector } from './types';

export const ragDnaTable = pgTable('rag_dna', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  layer: text('layer').notNull(),
  archetype: text('archetype'),
  title: text('title').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  tags: text('tags').array().default([]),
  sourceHash: text('source_hash'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
