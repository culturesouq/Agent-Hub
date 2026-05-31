import { pgTable, text, integer, date, uniqueIndex, timestamp } from 'drizzle-orm/pg-core';

/**
 * Per-operator per-day Firecrawl credit accounting.
 *
 * Purpose: prevent a runaway Vael (or any operator) crawl from burning the
 * Free-tier monthly budget in a single afternoon. The Firecrawl tool handlers
 * insert a row on first call of the day for an operator and bump `credits`
 * thereafter; a daily cap (env-configurable) hard-stops new calls when the
 * count reaches the ceiling.
 *
 * One row per (operator, date). The unique index prevents accidental
 * double-insert under concurrent calls; the handler upserts.
 *
 * Per [[srag-vael-as-service]] forward-compat: when Vael-as-Service launches,
 * the same table doubles as the per-customer ledger (operator_id is per
 * service customer's hidden Vael).
 */
export const operatorFirecrawlUsageTable = pgTable(
  'operator_firecrawl_usage',
  {
    id:         text('id').primaryKey(),
    operatorId: text('operator_id').notNull(),
    /** UTC date — 'YYYY-MM-DD' */
    usageDate:  date('usage_date').notNull(),
    /** Credits consumed today by this operator. One credit ≈ one Firecrawl page. */
    credits:    integer('credits').notNull().default(0),
    /** Last-touched marker for ops/forensics. */
    updatedAt:  timestamp('updated_at').defaultNow(),
  },
  (t) => ({
    /** One row per operator per day. */
    operatorDayUnique: uniqueIndex('operator_firecrawl_usage_op_day_uniq').on(
      t.operatorId,
      t.usageDate,
    ),
  }),
);

export type OperatorFirecrawlUsage = typeof operatorFirecrawlUsageTable.$inferSelect;
export type NewOperatorFirecrawlUsage = typeof operatorFirecrawlUsageTable.$inferInsert;
