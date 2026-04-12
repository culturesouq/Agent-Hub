import { pgTable, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export type RagSourceType = 'huggingface' | 'github_file' | 'github_repo' | 'raw_url';

export const ragSourcesTable = pgTable('rag_sources', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  sourceType: text('source_type').$type<RagSourceType>().notNull(),
  url: text('url').notNull(),
  notes: text('notes'),
  isActive: boolean('is_active').default(true).notNull(),
  lastFetchAt: timestamp('last_fetch_at'),
  lastFetchCount: integer('last_fetch_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
