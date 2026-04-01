import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const capabilityRequestsTable = pgTable('capability_requests', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  requestedCapability: text('requested_capability').notNull(),
  reason: text('reason').notNull(),
  ownerResponse: text('owner_response'),
  createdAt: timestamp('created_at').defaultNow(),
});
