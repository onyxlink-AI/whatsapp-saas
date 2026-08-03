-- ============================================================
-- Migration: 20260804000000_whiteboard_enabled
-- "Pizarra" (whiteboard) is opt-in per workspace, controlled only by
-- Onyxlink (superadmin) — same pattern as office_virtual_enabled/
-- chatbot_enabled. Every workspace starts with this off.
-- ============================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS whiteboard_enabled BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- End of migration: 20260804000000_whiteboard_enabled
-- ============================================================
