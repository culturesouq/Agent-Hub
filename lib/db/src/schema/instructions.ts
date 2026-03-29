import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const instructionsTable = pgTable("instructions", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInstructionSchema = createInsertSchema(instructionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInstruction = z.infer<typeof insertInstructionSchema>;
export type Instruction = typeof instructionsTable.$inferSelect;
