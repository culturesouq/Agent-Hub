import { pgTable, text, serial, timestamp, unique } from "drizzle-orm/pg-core";

export const oauthConnectionsTable = pgTable("oauth_connections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("owner"),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  accountLabel: text("account_label").notNull().default(""),
  scopes: text("scopes").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("oauth_user_provider_unique").on(t.userId, t.providerId),
]);

export type OAuthConnection = typeof oauthConnectionsTable.$inferSelect;
