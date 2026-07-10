-- ============================================================================
-- Memoria Inteligente Avanzada (Fase 1): flag opt-in por workspace + memoria
-- persistente por contacto (resumen, intereses, preferencias, objeciones,
-- estado de lead, siguiente paso). Cuando el flag está desactivado el sistema
-- se comporta exactamente como hoy — no se leen ni escriben estas tablas.
-- ============================================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS advanced_memory_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================
-- Table: contact_memories
-- ============================================
CREATE TABLE IF NOT EXISTS contact_memories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  summary      TEXT,
  interests    TEXT[] DEFAULT '{}'::text[] NOT NULL,
  preferences  JSONB DEFAULT '{}'::jsonb NOT NULL,
  objections   TEXT[] DEFAULT '{}'::text[] NOT NULL,
  lead_status  TEXT,
  next_step    TEXT,
  metadata     JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_memories_workspace ON contact_memories(workspace_id);

DROP TRIGGER IF EXISTS trg_contact_memories_updated_at ON contact_memories;
CREATE TRIGGER trg_contact_memories_updated_at
  BEFORE UPDATE ON contact_memories FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE contact_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read contact_memories"
  ON contact_memories FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write contact_memories"
  ON contact_memories FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );
