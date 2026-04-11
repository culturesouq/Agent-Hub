import { pgTable, text, boolean, timestamp, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vector } from './types';

export type DnaKnowledgeStatus = 'current' | 'upgraded' | 'deprecated' | 'draft';

export const ragDnaTable = pgTable('rag_dna', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  layer: text('layer').notNull(),
  archetype: text('archetype'),
  title: text('title').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  tags: text('tags').array().default([]),
  sourceName: text('source_name'),
  sourceHash: text('source_hash'),
  confidence: real('confidence').default(0.8),
  knowledgeStatus: text('knowledge_status').$type<DnaKnowledgeStatus>().default('current').notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
