import { pgTable, text, serial, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  backstory: text("backstory"),
  personality: text("personality"),
  coreValues: text("core_values"),
  expertiseAreas: text("expertise_areas"),
  communicationStyle: text("communication_style"),
  emotionalIntelligence: text("emotional_intelligence"),
  language: text("language").notNull().default("english"),
  model: text("model").notNull().default("openai/gpt-4.1-mini"),
  webSearchEnabled: boolean("web_search_enabled").notNull().default(false),
  voice: text("voice").notNull().default("nova"),
  voiceSpeed: real("voice_speed").notNull().default(1.0),
  isActive: boolean("is_active").notNull().default(true),
  lastActivity: timestamp("last_activity", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
