import { pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

const v3Schema = pgSchema('opsoul_v3');

export const sessionsTable = v3Schema.table('sessions', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
