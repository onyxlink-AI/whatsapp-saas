-- ============================================================
-- Migration: 20260713000500_gestion_enabled
-- Corrects a modeling mistake from the previous migration
-- (20260713000400_workspace_mode): "Onyxlink Gestión" (Clientes/Agenda/
-- Proyectos) is ALWAYS a separate add-on, never bundled with the WhatsApp
-- agent — a workspace can have the agent, Gestión, both, or neither. A
-- mutually-exclusive 'full'/'gestion' enum can't express "both", so it's
-- replaced with two independent booleans, matching every other add-on flag
-- on this table (advanced_memory_enabled, pipeline_ai_enabled, etc).
-- ============================================================

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS whatsapp_agent_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS gestion_enabled BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the column being replaced.
UPDATE workspaces SET whatsapp_agent_enabled = (workspace_mode = 'full');

-- The Onyxlink pilot workspace is already live on Clientes/Agenda/Proyectos —
-- keep it enabled explicitly since Gestión now defaults to off for everyone.
UPDATE workspaces SET gestion_enabled = true WHERE slug = 'onyxlink-kze';

ALTER TABLE workspaces DROP COLUMN IF EXISTS workspace_mode;

-- ============================================================
-- End of migration: 20260713000500_gestion_enabled
-- ============================================================
