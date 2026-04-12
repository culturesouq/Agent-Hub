import { pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

const v3Schema = pgSchema('opsoul_v3');

export const capabilityRequestsTable = v3Schema.table('capability_requests', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  requestedCapability: text('requested_capability').notNull(),
  reason: text('reason').notNull(),
  ownerResponse: text('owner_response'),
  createdAt: timestamp('created_at').defaultNow(),
});
