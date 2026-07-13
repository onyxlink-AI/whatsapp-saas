-- ============================================================
-- Migration: 20260713000300_projects
-- "Proyectos" module — a simple Kanban board (pendiente -> en_preparacion ->
-- en_proceso -> en_revision -> finalizado), generic enough to fit any
-- business. Mirrors the `deals` table's board-position pattern.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM (
    'pendiente', 'en_preparacion', 'en_proceso', 'en_revision', 'finalizado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL, -- cliente asociado
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date       DATE,
  priority       TEXT DEFAULT 'media' NOT NULL CHECK (priority IN ('baja', 'media', 'alta')),
  description    TEXT,
  notes          TEXT,
  status         project_status DEFAULT 'pendiente' NOT NULL,
  position       INT DEFAULT 0 NOT NULL, -- order within (workspace_id, status) for the kanban
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace     ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_board_column  ON projects(workspace_id, status, position);
CREATE INDEX IF NOT EXISTS idx_projects_contact        ON projects(workspace_id, contact_id);

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read projects"
  ON projects FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write projects"
  ON projects FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ============================================================
-- End of migration: 20260713000300_projects
-- ============================================================
