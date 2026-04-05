import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const ownersTable = pgTable('owners', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  googleId: text('google_id').unique(),
  isSovereignAdmin: boolean('is_sovereign_admin').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
