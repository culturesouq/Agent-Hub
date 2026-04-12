import { pgSchema, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

const v3Schema = pgSchema('opsoul_v3');

export const tasksTable = v3Schema.table('tasks', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  conversationId: text('conversation_id'),
  contextName: text('context_name').notNull(),
  taskType: text('task_type').notNull(),
  integrationLabel: text('integration_label').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').default('pending'),
  summary: text('summary'),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});
