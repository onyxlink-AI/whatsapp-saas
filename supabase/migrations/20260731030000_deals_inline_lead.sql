-- ============================================================
-- Migration: 20260731030000_deals_inline_lead
-- Creating an opportunity no longer requires an existing Contact — the admin
-- can type the lead's name/phone/email/sector directly on the deal. The
-- Contact only gets created when the deal is actually won (see the app-level
-- promotion logic in deal-actions.ts), never duplicated if it already exists.
-- ============================================================

ALTER TABLE deals ALTER COLUMN contact_id DROP NOT NULL;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS lead_name  TEXT,
  ADD COLUMN IF NOT EXISTS lead_phone TEXT,
  ADD COLUMN IF NOT EXISTS lead_email TEXT,
  ADD COLUMN IF NOT EXISTS sector_id  UUID REFERENCES sectors(id) ON DELETE SET NULL;

-- Every deal must be traceable to a real contact or carry its own inline
-- lead identity — never neither (same shape as tasks' chk_tasks_has_owner_entity).
ALTER TABLE deals
  ADD CONSTRAINT chk_deals_has_identity
  CHECK (contact_id IS NOT NULL OR (lead_name IS NOT NULL AND lead_phone IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_deals_sector ON deals(workspace_id, sector_id);

-- ============================================================
-- End of migration: 20260731030000_deals_inline_lead
-- ============================================================
