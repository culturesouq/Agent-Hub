import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentGrowthLogTable = pgTable("agent_growth_log", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});
