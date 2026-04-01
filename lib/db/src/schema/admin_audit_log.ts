import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const adminAuditLogTable = pgTable('admin_audit_log', {
  id: text('id').primaryKey(),
  adminId: text('admin_id').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ADMIN_AUDIT_LOG_TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is immutable -- no updates or deletes permitted';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_immutable'
  ) THEN
    CREATE TRIGGER audit_log_immutable
    BEFORE UPDATE OR DELETE ON admin_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
  END IF;
END $$;
`;
