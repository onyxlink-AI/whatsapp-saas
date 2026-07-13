-- ============================================================
-- Migration: 20260713000400_workspace_mode
-- Distinguishes two sellable products at workspace-creation time:
--   'full'    — the existing WhatsApp agent platform (Inbox/Agentes,
--               Pipeline, Asistente AI, agent-specific Settings tabs).
--   'gestion' — "Onyxlink Gestión": only Dashboard/Clientes/Agenda/
--               Proyectos, sold as a lighter standalone product with no
--               WhatsApp agent.
-- DEFAULT 'full' preserves current behavior for every existing workspace.
-- ============================================================

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS workspace_mode TEXT NOT NULL DEFAULT 'full'
  CHECK (workspace_mode IN ('full', 'gestion'));

-- ============================================================
-- End of migration: 20260713000400_workspace_mode
-- ============================================================
