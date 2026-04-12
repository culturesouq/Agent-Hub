import { pgSchema, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const v3Schema = pgSchema('opsoul_v3');

export const ownersTable = v3Schema.table('owners', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  googleId: text('google_id').unique(),
  isSovereignAdmin: boolean('is_sovereign_admin').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
