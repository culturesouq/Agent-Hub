import { pgTable, text, serial, timestamp, unique } from "drizzle-orm/pg-core";

export const serviceApiKeysTable = pgTable("service_api_keys", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("owner"),
  serviceId: text("service_id").notNull(),
  apiKey: text("api_key").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("api_key_user_service_unique").on(t.userId, t.serviceId),
]);

export type ServiceApiKey = typeof serviceApiKeysTable.$inferSelect;
