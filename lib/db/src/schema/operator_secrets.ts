import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const operatorSecretsTable = pgTable('operator_secrets', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  ownerId: text('owner_id').notNull(),
  key: text('key').notNull(),
  valueEncrypted: text('value_encrypted').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
