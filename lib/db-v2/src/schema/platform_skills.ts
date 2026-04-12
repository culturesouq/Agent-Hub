import { pgSchema, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { vector } from './types';

const v3Schema = pgSchema('opsoul_v3');

export const platformSkillsTable = v3Schema.table('platform_skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  triggerDescription: text('trigger_description'),
  instructions: text('instructions').notNull(),
  outputFormat: text('output_format'),
  archetype: text('archetype').default('All'),
  author: text('author').default('opsoul'),
  installCount: integer('install_count').default(0),
  integrationType: text('integration_type'),
  triggerEmbedding: vector('trigger_embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').defaultNow(),
});
