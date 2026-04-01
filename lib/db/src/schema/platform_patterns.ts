import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const platformPatternsTable = pgTable('platform_patterns', {
  id: text('id').primaryKey(),
  patternType: text('pattern_type').notNull(),
  affectedCount: integer('affected_count'),
  description: text('description'),
  status: text('status').default('open'),
  resolutionNote: text('resolution_note'),
  firstSeen: timestamp('first_seen'),
  lastSeen: timestamp('last_seen'),
  updatedAt: timestamp('updated_at').defaultNow(),
});
