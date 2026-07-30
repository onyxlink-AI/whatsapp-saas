-- ============================================================
-- Migration: 20260730020000_office_virtual_orchestrator_instructions
-- Adds a free-text "how the Orquestador should behave" field, analogous to
-- each specialist's own `instructions` field in office_virtual_configurations.
-- Mode-independent (applies whether the workspace runs openrouter or
-- hermes_telegram), so it lives at the top level, not inside either JSONB.
-- ============================================================

ALTER TABLE office_virtual_orchestrator
  ADD COLUMN IF NOT EXISTS custom_instructions TEXT NOT NULL DEFAULT '';

-- ============================================================
-- End of migration: 20260730020000_office_virtual_orchestrator_instructions
-- ============================================================
