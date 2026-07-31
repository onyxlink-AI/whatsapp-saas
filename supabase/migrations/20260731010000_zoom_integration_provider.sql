-- Adds 'zoom' as a valid integrations.provider, for the Zoom Server-to-Server
-- config (config.host_email — same shape as google_calendar's calendar_id
-- precedent, see 20260705000000_google_calendar.sql).
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction it's used in,
-- hence this is its own migration file (see 20260724000001_telegram_integration_provider.sql).

DO $$ BEGIN
  ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'zoom';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
