-- ============================================================================
-- Pipeline: sales opportunities (deals) and follow-up tasks per contact/deal.
-- deal_stage is intentionally separate from contact_stage — a contact's
-- lifecycle status and a specific opportunity's sales stage are different
-- concepts, and a contact may have zero or many deals over time.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE deal_stage AS ENUM (
    'new', 'contacted', 'proposal_sent', 'negotiation', 'won', 'lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'done', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- Table: deals
-- ============================================
CREATE TABLE IF NOT EXISTS deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  stage               deal_stage DEFAULT 'new' NOT NULL,
  value               NUMERIC(12,2) DEFAULT 0 NOT NULL,
  currency            TEXT DEFAULT 'MXN' NOT NULL,
  owner_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  expected_close_date DATE,
  closed_at           TIMESTAMPTZ,
  lost_reason         TEXT,
  position            INT DEFAULT 0 NOT NULL, -- order within (workspace_id, stage) for kanban drag
  notes               TEXT,
  source              TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deals_workspace    ON deals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_deals_contact      ON deals(workspace_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_board_column ON deals(workspace_id, stage, position);
CREATE INDEX IF NOT EXISTS idx_deals_owner        ON deals(workspace_id, owner_id);

DROP TRIGGER IF EXISTS trg_deals_updated_at ON deals;
CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read deals"
  ON deals FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write deals"
  ON deals FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ============================================
-- Table: tasks
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deal_id      UUID REFERENCES deals(id) ON DELETE CASCADE,
  contact_id   UUID REFERENCES contacts(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  task_type    TEXT DEFAULT 'follow_up' NOT NULL
    CHECK (task_type IN ('call','whatsapp_followup','email','meeting','follow_up','other')),
  status       task_status DEFAULT 'pending' NOT NULL,
  due_at       TIMESTAMPTZ,
  assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT chk_tasks_has_owner_entity CHECK (deal_id IS NOT NULL OR contact_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deal      ON tasks(workspace_id, deal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact   ON tasks(workspace_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned  ON tasks(workspace_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_open  ON tasks(workspace_id, due_at)
  WHERE status IN ('pending','in_progress');

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read tasks"
  ON tasks FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write tasks"
  ON tasks FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );
