import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentAutomationsTable = pgTable("agent_automations", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  triggerMessage: text("trigger_message").notNull(),
  cronExpression: text("cron_expression").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AgentAutomation = typeof agentAutomationsTable.$inferSelect;
