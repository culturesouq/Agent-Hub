import { pgSchema, text, boolean, timestamp } from 'drizzle-orm/pg-core';

const v3Schema = pgSchema('opsoul_v3');

export const operatorSkillsTable = v3Schema.table('operator_skills', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  skillId: text('skill_id').notNull(),
  customInstructions: text('custom_instructions'),
  isActive: boolean('is_active').default(true),
  installedAt: timestamp('installed_at').defaultNow(),
});
