-- ============================================================
-- Migration: 20260705000000_google_calendar
-- Agente WhatsApp — Google Calendar integration (service account model)
--
-- Adds 'google_calendar' as a valid integrations.provider value and seeds the
-- 2 new tools (check_availability_google, schedule_google) into the catalog.
-- Auth model: a single Google service account (env-level, shared across all
-- workspaces) is granted access per-client by having the client share their
-- calendar with the service account email. Per-workspace config only stores
-- the calendar_id, never credentials — mirrors the HighLevel PIT pattern but
-- with the secret held once at the platform level instead of per-workspace.
-- ============================================================

DO $$ BEGIN
  ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'google_calendar';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  ('check_availability_google', 'Consultar disponibilidad (Google Calendar)',
   'Checks real free time slots from a Google Calendar for a date range',
   '{"type":"object","properties":{"date_from":{"type":"string"},"date_to":{"type":"string"},"timezone":{"type":"string"}},"required":["date_from","date_to"]}',
   'read'),
  ('schedule_google', 'Agendar en Google Calendar',
   'Creates an event directly in the workspace Google Calendar',
   '{"type":"object","properties":{"datetime_iso":{"type":"string"},"duration_minutes":{"type":"number"},"contact_name":{"type":"string"},"contact_phone":{"type":"string"}},"required":["datetime_iso"]}',
   'write')
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      schema = EXCLUDED.schema,
      sensitivity = EXCLUDED.sensitivity;

-- ============================================================
-- End of migration: 20260705000000_google_calendar
-- ============================================================
