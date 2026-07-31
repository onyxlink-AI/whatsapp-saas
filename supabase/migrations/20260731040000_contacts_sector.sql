-- ============================================================
-- Migration: 20260731040000_contacts_sector
-- Lets a won deal's sector carry over to the real Contact/Client it gets
-- promoted into (see deal-actions.ts's promoteDealToContactIfWon), instead
-- of being lost at the moment of conversion.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_sector ON contacts(workspace_id, sector_id);

-- ============================================================
-- End of migration: 20260731040000_contacts_sector
-- ============================================================
