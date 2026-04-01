import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const agentChannelsTable = pgTable("agent_channels", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  channelType: text("channel_type").notNull(),
  credentials: text("credentials").notNull().default("{}"),
  webhookSecret: text("webhook_secret").notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentChannelSchema = createInsertSchema(agentChannelsTable).omit({ id: true, createdAt: true });
export type InsertAgentChannel = z.infer<typeof insertAgentChannelSchema>;
export type AgentChannel = typeof agentChannelsTable.$inferSelect;
