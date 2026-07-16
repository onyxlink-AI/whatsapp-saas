-- Oficina Virtual is an opt-in product provisioned only by Onyxlink.
-- Keeping the flag on workspaces matches the existing product gates while
-- ensuring every current and future client starts with the module hidden.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS office_virtual_enabled BOOLEAN NOT NULL DEFAULT false;

