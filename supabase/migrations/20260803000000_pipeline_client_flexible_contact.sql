-- ============================================================
-- Migration: 20260803000000_pipeline_client_flexible_contact
-- Phone stops being a hard requirement for a Pipeline lead or a Cliente —
-- only the name is required for an inline lead (deals), and Clientes can be
-- saved with whatever contact info is actually on hand (phone, email,
-- social media handle, a free-text contact method, or none of them). The
-- WhatsApp-sourced contacts flow is unaffected: an inbound message always
-- carries a phone, so those inserts keep working exactly as before.
-- ============================================================

-- deals: drop the phone half of the "has identity" rule — a lead now only
-- needs a name (or a linked contact_id).
ALTER TABLE deals DROP CONSTRAINT IF EXISTS chk_deals_has_identity;
ALTER TABLE deals
  ADD CONSTRAINT chk_deals_has_identity
  CHECK (contact_id IS NOT NULL OR lead_name IS NOT NULL);

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS lead_social TEXT,
  ADD COLUMN IF NOT EXISTS lead_contact_method TEXT;

-- contacts: phone is no longer NOT NULL. UNIQUE(workspace_id, phone) keeps
-- working — Postgres treats every NULL as distinct, so multiple phone-less
-- contacts in the same workspace don't collide.
ALTER TABLE contacts ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS social_media TEXT,
  ADD COLUMN IF NOT EXISTS contact_method TEXT;

-- ============================================================
-- End of migration: 20260803000000_pipeline_client_flexible_contact
-- ============================================================
