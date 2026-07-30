-- ============================================================================
-- Oficina Virtual: real per-workspace persistence for the Orquestador's model
-- policy (active mode, workspace-default OpenRouter model/fallback/cost
-- profile/limits, per-seat overrides, Hermes/Telegram bot id).
--
-- Supersedes useOrchestratorFeed.ts's previous client-only in-memory state,
-- which always started blank/"not configured" on every page load — see that
-- file's own former comment ("no real orchestrator backend is wired yet").
--
-- The real OpenRouter hasApiKey/status signal is NEVER persisted here: it is
-- always re-derived live from real-integration-status.ts on every read (see
-- orchestrator-service.ts's overlay step), exactly like
-- office_virtual_configurations already does for its own openRouterStatus —
-- whatever value happens to be saved in openrouter.hasApiKey/status/
-- statusDetail below is always superseded before being returned to a client.
--
-- Superadmin-only, same rationale as office_virtual_configurations: this is
-- Onyxlink-managed backend policy (model choice, cost limits), never
-- something a client's own workspace admin edits directly today.
-- ============================================================================

CREATE TABLE IF NOT EXISTS office_virtual_orchestrator (
  workspace_id      UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  active_mode       TEXT NOT NULL DEFAULT 'openrouter' CHECK (active_mode IN ('openrouter', 'hermes_telegram')),
  openrouter        JSONB NOT NULL,
  hermes_telegram   JSONB NOT NULL,
  revision          INT NOT NULL DEFAULT 1,
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_email  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_office_virtual_orchestrator_updated_at ON office_virtual_orchestrator;
CREATE TRIGGER trg_office_virtual_orchestrator_updated_at
  BEFORE UPDATE ON office_virtual_orchestrator FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE office_virtual_orchestrator ENABLE ROW LEVEL SECURITY;
-- Intentionally no SELECT/INSERT/UPDATE/DELETE policy for anon/authenticated
-- — same posture as office_virtual_configurations. The only way in is the
-- service-role client used by
-- src/app/api/workspace/[id]/office-virtual/orchestrator/route.ts, which
-- applies its own requireSuperAdmin() check before ever touching this table.
REVOKE ALL ON office_virtual_orchestrator FROM anon, authenticated;
