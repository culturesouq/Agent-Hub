-- Clean up old chunked operator-api fragments from the Nahil operator's KB,
-- then prepare for fresh upload of the consolidated doc.
--
-- Owner-discovered 2026-06-02: chunker.ts (CHUNK_SIZE=500) is defined but
-- unused. Current operator-kb POST stores whole docs (see operator-kb.ts:99
-- "Always store as a single entry — no chunking"). The old chunks are
-- pre-no-chunking-rule artifacts.
--
-- Run via:
--   psql "$DATABASE_URL" -f scripts/2026-06-02-nahil-kb-cleanup.sql
--
-- Safe: wrapped in BEGIN/COMMIT, lists what will be deleted before deletion.

BEGIN;

-- Find Nahil operator id (assumes name match — adjust if multiple)
WITH nahil_op AS (
  SELECT id FROM operators WHERE LOWER(name) LIKE '%nahil%' LIMIT 1
)
-- Step 1: SHOW what we'd delete
SELECT
  id,
  chunk_index,
  source_name,
  source_url,
  LENGTH(content) AS content_length,
  LEFT(content, 100) AS content_preview,
  created_at
FROM operator_kb
WHERE operator_id = (SELECT id FROM nahil_op)
  AND (
    -- Match by source name / URL hints
    LOWER(source_name) LIKE '%operator-api%'
    OR LOWER(source_url)  LIKE '%operator-api%'
    OR LOWER(source_name) LIKE '%nahil api%'
    OR LOWER(source_name) LIKE '%api contract%'
    -- Match by content patterns characteristic of the doc
    OR content LIKE '%/api/agent/%'
    OR content LIKE '%scope: `users`%'
    OR content LIKE '%scope: `seasons`%'
    OR content LIKE '%scope: `knowledge`%'
    OR content LIKE '%scope: `intelligence`%'
    -- Match by being a fragment (chunk_index > 0 is always a fragment)
    OR chunk_index > 0
  )
ORDER BY created_at, chunk_index;

-- Step 2: DELETE matching entries
WITH nahil_op AS (
  SELECT id FROM operators WHERE LOWER(name) LIKE '%nahil%' LIMIT 1
)
DELETE FROM operator_kb
WHERE operator_id = (SELECT id FROM nahil_op)
  AND (
    LOWER(source_name) LIKE '%operator-api%'
    OR LOWER(source_url)  LIKE '%operator-api%'
    OR LOWER(source_name) LIKE '%nahil api%'
    OR LOWER(source_name) LIKE '%api contract%'
    OR content LIKE '%/api/agent/%'
    OR content LIKE '%scope: `users`%'
    OR content LIKE '%scope: `seasons`%'
    OR content LIKE '%scope: `knowledge`%'
    OR content LIKE '%scope: `intelligence`%'
    OR chunk_index > 0
  );

-- Step 3: verify post-state (should return zero rows after delete)
WITH nahil_op AS (
  SELECT id FROM operators WHERE LOWER(name) LIKE '%nahil%' LIMIT 1
)
SELECT
  COUNT(*) AS remaining_operator_api_entries
FROM operator_kb
WHERE operator_id = (SELECT id FROM nahil_op)
  AND (content LIKE '%/api/agent/%' OR chunk_index > 0);

-- Step 4: total Nahil KB count for sanity
WITH nahil_op AS (
  SELECT id FROM operators WHERE LOWER(name) LIKE '%nahil%' LIMIT 1
)
SELECT COUNT(*) AS total_nahil_kb_entries
FROM operator_kb
WHERE operator_id = (SELECT id FROM nahil_op);

COMMIT;
