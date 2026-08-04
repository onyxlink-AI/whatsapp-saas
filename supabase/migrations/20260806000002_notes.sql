-- ============================================================
-- Migration: 20260806000002_notes
-- Fase 2 del roadmap comercial: "Anotaciones" — vista independiente de
-- Board dentro de Proyectos. El contenido se guarda como el documento JSON
-- del editor (Tiptap/ProseMirror), no como HTML libre: el propio esquema de
-- extensiones habilitadas en el editor (encabezados 1-3, párrafo, listas,
-- negrita, cursiva, enlaces) es lo que impide que entre marcado o estilos
-- fuera de lo permitido, igual de en espíritu a como `whiteboards.scene_data`
-- guarda la escena de Excalidraw como JSON estructurado en vez de HTML.
-- ============================================================

CREATE TABLE IF NOT EXISTS notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  title        TEXT NOT NULL DEFAULT 'Sin título',
  content      JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  template     TEXT,
  archived_at  TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes(workspace_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(workspace_id, project_id);

DROP TRIGGER IF EXISTS trg_notes_updated_at ON notes;
CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read notes"
  ON notes FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write notes"
  ON notes FOR ALL
  USING (workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[]))
  WITH CHECK (workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[]));

-- ============================================================
-- End of migration: 20260806000002_notes
-- ============================================================
