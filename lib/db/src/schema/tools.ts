import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentToolsTable = pgTable("agent_tools", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  parametersSchema: text("parameters_schema").notNull().default("[]"),
  webhookUrl: text("webhook_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AgentTool = typeof agentToolsTable.$inferSelect;
