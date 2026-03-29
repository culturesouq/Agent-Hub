import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const connectionsTable = pgTable("connections", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  appName: text("app_name").notNull(),
  apiKey: text("api_key").notNull().unique(),
  lastUsed: timestamp("last_used", { withTimezone: true }),
  requestCount: integer("request_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertConnectionSchema = createInsertSchema(connectionsTable).omit({ id: true, createdAt: true });
export type InsertConnection = z.infer<typeof insertConnectionSchema>;
export type Connection = typeof connectionsTable.$inferSelect;
