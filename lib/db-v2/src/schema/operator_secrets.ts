import { pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

const v3Schema = pgSchema('opsoul_v3');

export const operatorSecretsTable = v3Schema.table('operator_secrets', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  ownerId: text('owner_id').notNull(),
  key: text('key').notNull(),
  valueEncrypted: text('value_encrypted').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
