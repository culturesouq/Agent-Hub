import { pgSchema, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

const v3Schema = pgSchema('opsoul_v3');

export const messagesTable = v3Schema.table('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  operatorId: text('operator_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count'),
  isInternal: boolean('is_internal').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
