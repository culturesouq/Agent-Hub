import { pgTable, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const operatorIntegrationsTable = pgTable('operator_integrations', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  ownerId: text('owner_id').notNull(),
  integrationType: text('integration_type').notNull(),
  integrationLabel: text('integration_label').notNull(),
  tokenEncrypted: text('token_encrypted'),
  scopes: text('scopes').array(),
  status: text('status').default('connected'),
  scopeUpdatePending: boolean('scope_update_pending').default(false),
  scopeUpdateSummary: text('scope_update_summary'),
  contextsAssigned: text('contexts_assigned').array(),
  createdAt: timestamp('created_at').defaultNow(),
  baseUrl: text('base_url'),
  appSchema: jsonb('app_schema'),
  isCustomApp: boolean('is_custom_app').default(false),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
});
