import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const operatorFilesTable = pgTable('operator_files', {
  id:          text('id').primaryKey(),
  operatorId:  text('operator_id').notNull(),
  ownerId:     text('owner_id').notNull(),
  filename:    text('filename').notNull(),
  content:     text('content').notNull().default(''),
  createdAt:   timestamp('created_at').defaultNow(),
  updatedAt:   timestamp('updated_at').defaultNow(),
});
