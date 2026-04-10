import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const operatorDeploymentSlotsTable = pgTable('operator_deployment_slots', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  surfaceType: text('surface_type').notNull(),
  scopeTrust: text('scope_trust').notNull(),
  apiKey: text('api_key').notNull().unique(),
  apiKeyPreview: text('api_key_preview').notNull(),
  isActive: boolean('is_active').default(true),
  allowedOrigins: text('allowed_origins').array(),
  createdAt: timestamp('created_at').defaultNow(),
  revokedAt: timestamp('revoked_at'),
});
