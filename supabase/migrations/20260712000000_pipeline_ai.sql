-- ============================================================================
-- Sugerencias de Pipeline con IA (opt-in, add-on facturable aparte, igual
-- patrón que advanced_memory_enabled). El agente NUNCA mueve un deal por su
-- cuenta — solo escribe una sugerencia (etapa + motivo) que un humano acepta
-- o descarta desde el tablero Pipeline.
-- ============================================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS pipeline_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS ai_suggested_stage deal_stage,
  ADD COLUMN IF NOT EXISTS ai_suggested_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_suggested_at TIMESTAMPTZ;

-- No RLS changes needed — these are nullable columns on the already-RLS'd
-- `deals` table (see 20260708000000_pipeline.sql), covered by the existing
-- "ws operators write deals" policy.
