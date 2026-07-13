-- ============================================================
-- Migration: 20260713000600_tasks_projects_subtasks
-- "Tareas" moves from Clientes into Proyectos — tasks can now hang off a
-- project (not just a deal or a contact). Also adds subtasks (a simple
-- checklist under a task), part of the Proyectos restructure.
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(workspace_id, project_id);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_has_owner_entity;
ALTER TABLE tasks ADD CONSTRAINT chk_tasks_has_owner_entity
  CHECK (deal_id IS NOT NULL OR contact_id IS NOT NULL OR project_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS subtasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  done         BOOLEAN DEFAULT FALSE NOT NULL,
  position     INT DEFAULT 0 NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_workspace ON subtasks(workspace_id);

DROP TRIGGER IF EXISTS trg_subtasks_updated_at ON subtasks;
CREATE TRIGGER trg_subtasks_updated_at
  BEFORE UPDATE ON subtasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read subtasks"
  ON subtasks FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write subtasks"
  ON subtasks FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ============================================================
-- End of migration: 20260713000600_tasks_projects_subtasks
-- ============================================================
