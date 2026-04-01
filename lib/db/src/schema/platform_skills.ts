import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const platformSkillsTable = pgTable('platform_skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  triggerDescription: text('trigger_description'),
  instructions: text('instructions').notNull(),
  outputFormat: text('output_format'),
  author: text('author').default('opsoul'),
  installCount: integer('install_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});
