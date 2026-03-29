import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentAutomationsTable = pgTable("agent_automations", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull().default("schedule"),
  cronExpression: text("cron_expression"),
  webhookSecret: text("webhook_secret"),
  prompt: text("prompt").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRunsTable = pgTable("automation_runs", {
  id: serial("id").primaryKey(),
  automationId: integer("automation_id")
    .notNull()
    .references(() => agentAutomationsTable.id, { onDelete: "cascade" }),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  prompt: text("prompt").notNull(),
  response: text("response"),
  status: text("status").notNull().default("pending"),
});

export type AgentAutomation = typeof agentAutomationsTable.$inferSelect;
export type AutomationRun = typeof automationRunsTable.$inferSelect;
