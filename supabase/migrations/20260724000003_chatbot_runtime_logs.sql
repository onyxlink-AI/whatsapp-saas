-- Minimal technical/diagnostic log for the Chatbot runtime — NOT
-- conversational memory. Nothing in src/features/chatbot/server/
-- chatbot-runtime.ts ever reads this table back; it exists purely for
-- security/diagnostic visibility (was a given inbound message answered by
-- the model or by the fallback, how long did it take, did it error).
-- question_excerpt is truncated and is not linked to any contact/user
-- profile — there is deliberately no way to reconstruct a conversation
-- from this table.

CREATE TABLE IF NOT EXISTS chatbot_runtime_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL CHECK (provider IN ('whatsapp', 'telegram')),
  source            TEXT NOT NULL CHECK (source IN ('openrouter', 'fallback', 'error')),
  question_excerpt  TEXT,
  latency_ms        INT,
  error_code        TEXT,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_runtime_logs_workspace
  ON chatbot_runtime_logs(workspace_id, occurred_at DESC);

ALTER TABLE chatbot_runtime_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chatbot_runtime_logs FROM anon, authenticated;
