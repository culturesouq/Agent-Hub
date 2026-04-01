import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const sessionsTable = pgTable('sessions', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
