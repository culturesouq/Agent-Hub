import { pgSchema, text, boolean, timestamp, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vector } from './types';

const v3Schema = pgSchema('opsoul_v3');

export type DnaKnowledgeStatus = 'current' | 'upgraded' | 'deprecated' | 'draft';
export type DnaScope = 'general' | 'specialty';

export const ragDnaTable = v3Schema.table('rag_dna', {
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
  knowledgeStatus: text('knowledge_status').$type<DnaKnowledgeStatus>().default('draft').notNull(),
  dnaScope: text('dna_scope').$type<DnaScope>().default('general').notNull(),
  archetypeScope: text('archetype_scope').array().default([]).notNull(),
  domainTags: text('domain_tags').array().default([]).notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
