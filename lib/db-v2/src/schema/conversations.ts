import { pgSchema, text, integer, timestamp } from 'drizzle-orm/pg-core';

const v3Schema = pgSchema('opsoul_v3');

export const conversationsTable = v3Schema.table('conversations', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  ownerId: text('owner_id').notNull(),
  contextName: text('context_name').notNull(),
  scopeId: text('scope_id').notNull(),
  scopeType: text('scope_type').notNull().default('owner'),
  messageCount: integer('message_count').default(0),
  lastMessageAt: timestamp('last_message_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
