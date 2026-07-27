-- Adds 'telegram' as a valid integrations.provider, for the Chatbot's
-- Telegram bot token (credentials.telegram_bot_token) and webhook secret
-- (credentials.telegram_webhook_secret) — same shape as the ycloud/openrouter
-- PAT pattern (see 20260707000000_airtable.sql for the identical precedent).
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction it's used in,
-- hence this is its own migration file.

DO $$ BEGIN
  ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'telegram';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
