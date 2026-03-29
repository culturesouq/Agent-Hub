import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentMemoriesTable = pgTable("agent_memories", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AgentMemory = typeof agentMemoriesTable.$inferSelect;
