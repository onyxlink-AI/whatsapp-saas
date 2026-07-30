-- ============================================================
-- Migration: 20260730030000_agenda_tasks_time_and_calendar_sync
-- Adds an optional time-of-day (start/end) to agenda_tasks, so an item can
-- carry a real appointment time instead of only a bare date, and a
-- google_event_id to track the corresponding Google Calendar event when one
-- was created for it (best-effort one-way sync, create-only for now).
-- ============================================================

ALTER TABLE agenda_tasks
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- ============================================================
-- End of migration: 20260730030000_agenda_tasks_time_and_calendar_sync
-- ============================================================
