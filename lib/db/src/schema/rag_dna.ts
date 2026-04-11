import { pgTable, text, boolean, timestamp, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vector } from './types';

export type DnaKnowledgeStatus = 'current' | 'upgraded' | 'deprecated' | 'draft';

export type DnaScope = 'general' | 'specialty';

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
  // ── Collective DNA scoping ────────────────────────────────────────────────
  // dnaScope: 'general' = inject to archetypes in archetypeScope (empty = all)
  //           'specialty' = inject only when operator domainTags overlap
  dnaScope: text('dna_scope').$type<DnaScope>().default('general').notNull(),
  archetypeScope: text('archetype_scope').array().default([]).notNull(),
  domainTags: text('domain_tags').array().default([]).notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
