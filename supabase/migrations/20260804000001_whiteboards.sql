-- ============================================================
-- Migration: 20260804000001_whiteboards
-- "Pizarra" module — Excalidraw-backed boards (diagrams + freehand
-- drawing) per workspace. Mirrors the `projects` table's shape/RLS
-- pattern (see 20260713000300_projects.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS whiteboards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'Sin título',
  scene_data   JSONB NOT NULL DEFAULT '{"elements":[],"appState":{}}'::jsonb,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whiteboards_workspace ON whiteboards(workspace_id);

DROP TRIGGER IF EXISTS trg_whiteboards_updated_at ON whiteboards;
CREATE TRIGGER trg_whiteboards_updated_at
  BEFORE UPDATE ON whiteboards FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read whiteboards"
  ON whiteboards FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write whiteboards"
  ON whiteboards FOR ALL
  USING (workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[]))
  WITH CHECK (workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[]));

-- ============================================================
-- End of migration: 20260804000001_whiteboards
-- ============================================================
