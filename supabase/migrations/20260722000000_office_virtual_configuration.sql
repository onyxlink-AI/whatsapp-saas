-- ============================================================================
-- Oficina Virtual: real per-workspace specialist configuration persistence.
-- Supersedes the earlier client-only fixture state — the OfficeConfiguration
-- document (office name, 8 configurable specialist seats, sector, draft/
-- published status, revision) was never backed by a table before this.
--
-- One row per workspace holds the current head (office_virtual_configurations).
-- Every mutation also appends an immutable snapshot to
-- office_virtual_configuration_revisions so "restaurar" can read back an
-- exact prior document without keeping full history in memory, and so every
-- save/publish/restore/sector-change is auditable.
--
-- This content (specialist name/function/objective/instructions/client-layer
-- text) is superadmin-exclusive per product policy — never read directly by
-- a workspace admin/manager's session. Both tables therefore have RLS
-- enabled with NO policy granted to anon/authenticated: the only way in is
-- the service-role client used by src/app/api/workspace/[id]/office-virtual/
-- configurator/route.ts, which applies its own requireSuperAdmin() check
-- before ever touching these tables. This mirrors how office_virtual_enabled
-- itself is toggled (see 20260719000000_office_virtual_enabled.sql) — no RLS
-- policy restricts it to superadmins either, because "ONYXLINK superadmin"
-- is a platform-level users.is_super_admin flag, not a workspace_role, so it
-- cannot be expressed as a workspace-scoped RLS predicate. Regular workspace
-- members never need to read these tables at all: the 3D office instead
-- reads the sanitized *published* seat projection via
-- office-agents/route.ts, which is authorized for workspace admin/manager
-- and only ever returns name/function/objective/color — never instructions
-- or the client layer.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE office_configuration_status AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS office_virtual_configurations (
  workspace_id      UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  preset_id         TEXT NOT NULL DEFAULT 'standard-virtual-office',
  preset_version    TEXT NOT NULL DEFAULT '2.0.0',
  revision          INT NOT NULL DEFAULT 1,
  status            office_configuration_status NOT NULL DEFAULT 'draft',
  document          JSONB NOT NULL,
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_email  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_office_virtual_configurations_updated_at ON office_virtual_configurations;
CREATE TRIGGER trg_office_virtual_configurations_updated_at
  BEFORE UPDATE ON office_virtual_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE office_virtual_configurations ENABLE ROW LEVEL SECURITY;
-- Intentionally no SELECT/INSERT/UPDATE/DELETE policy for anon/authenticated
-- — see header comment. `REVOKE` is redundant with RLS-default-deny but
-- makes the intent explicit and survives a future permissive policy typo.
REVOKE ALL ON office_virtual_configurations FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS office_virtual_configuration_revisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  revision        INT NOT NULL,
  action          TEXT NOT NULL, -- provisioned|office_updated|specialist_updated|specialist_reset|vertical_applied|published|revision_restored
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email     TEXT NOT NULL,
  source_revision INT,
  document        JSONB NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_office_virtual_configuration_revisions_workspace
  ON office_virtual_configuration_revisions(workspace_id, revision DESC);

ALTER TABLE office_virtual_configuration_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON office_virtual_configuration_revisions FROM anon, authenticated;
