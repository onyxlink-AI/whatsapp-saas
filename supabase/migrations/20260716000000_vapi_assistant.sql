-- ============================================================================
-- Asistente AI (voz, Vapi): vincula un workspace a un assistant de Vapi y
-- guarda cada llamada recibida vía webhook (end-of-call-report), no por
-- polling a la API de Vapi. Dormant unless vapi_assistant_id is set — no
-- reads/writes happen for workspaces without a linked assistant.
-- ============================================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS vapi_assistant_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspaces_vapi_assistant_id
  ON workspaces(vapi_assistant_id)
  WHERE vapi_assistant_id IS NOT NULL;

-- ============================================
-- Table: voice_calls
-- One row per Vapi call, upserted (on vapi_call_id) from the webhook so
-- retries are idempotent. raw_payload keeps the full webhook body so no
-- field is ever silently lost even if our column mapping misses something.
-- ============================================
CREATE TABLE IF NOT EXISTS voice_calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  vapi_call_id      TEXT NOT NULL UNIQUE,
  assistant_id      TEXT,
  status            TEXT,
  ended_reason      TEXT,
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  duration_seconds  INT,
  cost              NUMERIC(10,4),
  customer_number   TEXT,
  transcript        TEXT,
  summary           TEXT,
  lead_status       TEXT,
  raw_payload       JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_calls_workspace ON voice_calls(workspace_id, created_at DESC);

ALTER TABLE voice_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read voice_calls"
  ON voice_calls FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

-- No client INSERT/UPDATE/DELETE policy: rows are written only by the
-- Vapi webhook handler via the service-role client (bypasses RLS), same
-- pattern as the "tools" catalog table.
