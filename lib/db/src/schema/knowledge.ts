import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const knowledgeTable = pgTable("knowledge", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("text"),
  title: text("title"),
  content: text("content").notNull(),
  sourceUrl: text("source_url"),
  sourceFilename: text("source_filename"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertKnowledgeSchema = createInsertSchema(knowledgeTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKnowledge = z.infer<typeof insertKnowledgeSchema>;
export type Knowledge = typeof knowledgeTable.$inferSelect;
