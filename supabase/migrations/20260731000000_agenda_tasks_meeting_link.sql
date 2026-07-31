-- ============================================================
-- Migration: 20260731000000_agenda_tasks_meeting_link
-- Stores the Google Meet link generated alongside a task's synced Google
-- Calendar event, so it's ready to read/copy/send later without having to
-- open Calendar — e.g. by whoever (or whichever agent, eventually) follows
-- up with the contact.
-- ============================================================

ALTER TABLE agenda_tasks
  ADD COLUMN IF NOT EXISTS meeting_link TEXT;

-- ============================================================
-- End of migration: 20260731000000_agenda_tasks_meeting_link
-- ============================================================
