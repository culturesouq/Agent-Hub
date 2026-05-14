-- Layer 2 cleanup — owner-approved 2026-05-14 evening
-- Owner direction: "memories and operators aren't important, what's
-- important is infrastructure. We don't have any users, so no need to
-- keep any."
--
-- Drops every Layer 2 main-memory row across all operators. Includes the
-- three pre-existing smoke-test pollution rows (0248215c…, dbf6de71…,
-- 4f321043…) plus any other distilled patterns from prior testing.
--
-- Layer 1 (operator_memory) is also reset because Layer 1 entries from
-- test conversations are similarly noise. Conversations and message
-- history are NOT touched here — owner can clear separately if desired.
--
-- Idempotent. Safe to re-run. After this script + the new
-- SANDBOX_USERID_PATTERN guard in public-chat.ts (commit pending), the
-- pollution incident pattern from 2026-05-13 is architecturally
-- prevented from recurring: smoke-shaped userIds are rejected at the
-- API boundary unless they target the SANDBOX_OPERATOR_ID operator.

BEGIN;

DELETE FROM operator_main_memory;
DELETE FROM operator_memory;

COMMIT;

-- After running:
--   SELECT COUNT(*) FROM operator_main_memory;  -- should be 0
--   SELECT COUNT(*) FROM operator_memory;        -- should be 0
