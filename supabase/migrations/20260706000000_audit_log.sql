-- ============================================================================
-- Audit log: who changed what (prompts, agents, tools, integrations) and when.
-- Written server-side only, via the service role — RLS below only grants
-- workspace members read access; there is no INSERT/UPDATE/DELETE policy for
-- anon/authenticated, so the service role is the only way to write rows.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name    TEXT NOT NULL,
  actor_email   TEXT NOT NULL,
  action        TEXT NOT NULL, -- e.g. 'prompt.publish', 'agent.activate', 'tool.enable'
  target_type   TEXT NOT NULL, -- 'prompt_version' | 'agent' | 'tool_config' | 'integration'
  target_id     TEXT,
  summary       TEXT NOT NULL, -- human-readable one-liner for the UI
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_workspace
  ON audit_log(workspace_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select"
  ON audit_log FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));
