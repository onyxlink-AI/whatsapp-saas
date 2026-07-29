-- 💬 Chatbot is an opt-in product provisioned only by Onyxlink, same pattern
-- as office_virtual_enabled — every current and future client starts with
-- the module hidden until Onyxlink turns it on for that workspace.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS chatbot_enabled BOOLEAN NOT NULL DEFAULT false;
