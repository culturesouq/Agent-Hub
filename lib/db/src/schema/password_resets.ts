import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const passwordResetsTable = pgTable('password_resets', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
