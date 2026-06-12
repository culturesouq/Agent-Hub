-- Migration: add model_config JSONB column to operators table
-- Adds per-operator BYO model configuration (provider, model ID, encrypted API key, baseUrl).
--
-- Run manually on the target database BEFORE deploying the
-- "feat: per-operator BYO model config" build. Idempotent — safe to run twice.
--
-- Usage:
--   psql "$DATABASE_URL" -f migrations/add_operator_model_config.sql

ALTER TABLE operators ADD COLUMN IF NOT EXISTS model_config JSONB;

-- No index needed: model_config is looked up by operator id (already PK-indexed).
-- No NOT NULL constraint: NULL means "use platform default" (the normal case).
