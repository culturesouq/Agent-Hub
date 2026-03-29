import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { connectionsTable } from "./connections";

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").references(() => connectionsTable.id, { onDelete: "set null" }),
  appName: text("app_name"),
  userMessage: text("user_message").notNull(),
  agentResponse: text("agent_response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activityTable).omit({ id: true, createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityTable.$inferSelect;
