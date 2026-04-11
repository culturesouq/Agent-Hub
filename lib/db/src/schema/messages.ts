import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { conversationsTable } from './conversations';

export const messagesTable = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversationsTable.id),
  operatorId: text('operator_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count'),
  isInternal: boolean('is_internal').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
