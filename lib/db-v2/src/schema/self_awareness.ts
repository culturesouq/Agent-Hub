import { pgSchema, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

const v3Schema = pgSchema('opsoul_v3');

export const selfAwarenessStateTable = v3Schema.table('self_awareness_state', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull().unique(),
  identityState: jsonb('identity_state'),
  soulState: jsonb('soul_state'),
  capabilityState: jsonb('capability_state'),
  taskHistory: jsonb('task_history'),
  mandateGaps: text('mandate_gaps').array(),
  healthScore: jsonb('health_score'),
  workspaceManifest: jsonb('workspace_manifest'),
  lastUpdated: timestamp('last_updated').defaultNow(),
  lastUpdateTrigger: text('last_update_trigger'),
});
