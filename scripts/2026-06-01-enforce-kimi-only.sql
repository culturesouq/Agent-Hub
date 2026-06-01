-- 2026-06-01: Enforce Kimi-only model across all operators.
--
-- Owner directive: OpSoul runs only on moonshotai/kimi-k2.5 (no Claude/GPT/Gemini
-- routing anywhere). Code side: BIRTH_MODEL_ID set to DEFAULT_MODEL_ID (Kimi) in
-- modelRegistry.ts. Per-operator override path stays (column not dropped) but any
-- prior non-Kimi value is reset to 'opsoul/auto' which resolves to Kimi via the
-- runtime selector in chat.ts / public-chat.ts.
--
-- Safe to run repeatedly (idempotent — operators already on opsoul/auto or null
-- are not touched).
--
-- Run with the OpSoul prod DATABASE_URL:
--   psql "$DATABASE_URL" -f scripts/2026-06-01-enforce-kimi-only.sql

BEGIN;

-- Show what will change BEFORE updating
SELECT id, name, default_model
FROM operators
WHERE default_model IS NOT NULL
  AND default_model NOT IN ('opsoul/auto', 'moonshotai/kimi-k2.5');

-- Reset any non-Kimi defaultModel to opsoul/auto (selector → Kimi K2.5)
UPDATE operators
SET    default_model = 'opsoul/auto'
WHERE  default_model IS NOT NULL
  AND  default_model NOT IN ('opsoul/auto', 'moonshotai/kimi-k2.5');

-- Confirm post-state
SELECT default_model, COUNT(*) AS n
FROM operators
GROUP BY default_model
ORDER BY n DESC;

COMMIT;
