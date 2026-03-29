import { pgTable, text, serial, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentIntegrationsTable = pgTable("agent_integrations", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  serviceId: text("service_id").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  connectorConfigId: text("connector_config_id"),
  authType: text("auth_type").notNull().default("api_key"),
  credentialKey: text("credential_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("agent_service_unique").on(t.agentId, t.serviceId),
]);

export type AgentIntegration = typeof agentIntegrationsTable.$inferSelect;
