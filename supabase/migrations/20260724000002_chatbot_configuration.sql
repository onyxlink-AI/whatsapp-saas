-- ============================================================================
-- 💬 Chatbot: real per-workspace configuration persistence.
--
-- One row per workspace holds the current head (chatbots). Every mutation
-- also appends an immutable snapshot to chatbot_revisions, mirroring
-- office_virtual_configurations/office_virtual_configuration_revisions
-- (20260722000000_office_virtual_configuration.sql) exactly in shape.
--
-- Access model: same as the Oficina Virtual Configurador — Onyxlink-
-- superadmin-exclusive. The Chatbot is NOT client self-service: only the
-- platform superadmin may read or write this document (requireSuperAdmin()
-- on every /api/workspace/[id]/chatbot* route — see
-- src/lib/auth/workspace-access.ts). That check lives entirely in the app
-- layer; it does NOT change the RLS posture. Every JSONB-document table in
-- this codebase already goes through the service-role client + an
-- app-layer check rather than relying on RLS policies for these documents,
-- so RLS here stays "enabled, no policy for anon/authenticated" for the
-- same defense-in-depth reason (fail closed even if a route's app-layer
-- check ever regresses).
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE chatbot_status AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS chatbots (
  workspace_id      UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  revision          INT NOT NULL DEFAULT 1,
  status            chatbot_status NOT NULL DEFAULT 'draft',
  enabled           BOOLEAN NOT NULL DEFAULT false,
  document          JSONB NOT NULL,
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_email  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_chatbots_updated_at ON chatbots;
CREATE TRIGGER trg_chatbots_updated_at
  BEFORE UPDATE ON chatbots FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chatbots FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS chatbot_revisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  revision        INT NOT NULL,
  action          TEXT NOT NULL, -- provisioned|draft_updated|channel_selected|published|enabled_changed
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email     TEXT NOT NULL,
  document        JSONB NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_revisions_workspace
  ON chatbot_revisions(workspace_id, revision DESC);

ALTER TABLE chatbot_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chatbot_revisions FROM anon, authenticated;
