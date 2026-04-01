import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const operatorSkillsTable = pgTable('operator_skills', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  skillId: text('skill_id').notNull(),
  customInstructions: text('custom_instructions'),
  isActive: boolean('is_active').default(true),
  installedAt: timestamp('installed_at').defaultNow(),
});
