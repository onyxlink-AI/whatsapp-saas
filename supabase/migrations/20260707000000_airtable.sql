-- ============================================================
-- Migration: 20260707000000_airtable
-- Agente WhatsApp — Airtable integration (per-workspace mirror)
--
-- Adds 'airtable' as a valid integrations.provider value. Unlike Google
-- Calendar (one shared service account), each workspace connects its own
-- Airtable base with its own Personal Access Token — stored encrypted in
-- integrations.credentials, same shape as the ycloud/openrouter PAT pattern.
-- integrations.config holds base_id + table_name (not sensitive).
-- ============================================================

DO $$ BEGIN
  ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'airtable';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- End of migration: 20260707000000_airtable
-- ============================================================
