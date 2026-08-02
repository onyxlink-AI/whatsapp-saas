-- The Asistente de Ayuda's action tools (crear/editar cliente, mover
-- oportunidad, crear/editar proyecto o tarea) are opt-in per workspace,
-- controlled only by Onyxlink (superadmin) — same pattern as
-- office_virtual_enabled/chatbot_enabled. Every workspace starts with this
-- off: the assistant stays text-only (answers questions, never acts) until
-- Onyxlink turns it on for that specific client.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS help_assistant_actions_enabled BOOLEAN NOT NULL DEFAULT false;
