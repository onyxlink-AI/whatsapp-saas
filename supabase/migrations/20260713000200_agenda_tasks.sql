-- ============================================================
-- Migration: 20260713000200_agenda_tasks
-- "Agenda" module — a simple day/week task planner, deliberately separate
-- from the pipeline `tasks` table (which requires a deal_id or contact_id).
-- Agenda tasks are free-standing team planning items, not tied to a CRM
-- entity.
-- ============================================================

CREATE TABLE IF NOT EXISTS agenda_tasks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  notes                TEXT,
  scheduled_date       DATE,
  scheduled_week_start DATE, -- Monday of the week, when assigned by week instead of by day
  done                 BOOLEAN DEFAULT FALSE NOT NULL,
  assigned_to          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT chk_agenda_tasks_has_schedule CHECK (scheduled_date IS NOT NULL OR scheduled_week_start IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_agenda_tasks_workspace_date ON agenda_tasks(workspace_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_agenda_tasks_workspace_week ON agenda_tasks(workspace_id, scheduled_week_start);
CREATE INDEX IF NOT EXISTS idx_agenda_tasks_assigned       ON agenda_tasks(workspace_id, assigned_to);

DROP TRIGGER IF EXISTS trg_agenda_tasks_updated_at ON agenda_tasks;
CREATE TRIGGER trg_agenda_tasks_updated_at
  BEFORE UPDATE ON agenda_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE agenda_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read agenda_tasks"
  ON agenda_tasks FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write agenda_tasks"
  ON agenda_tasks FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ============================================================
-- End of migration: 20260713000200_agenda_tasks
-- ============================================================
