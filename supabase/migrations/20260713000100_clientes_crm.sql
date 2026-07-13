-- ============================================================
-- Migration: 20260713000100_clientes_crm
-- "Clientes" CRM module. Extends the existing `contacts` table (a client is
-- the same record used across WhatsApp/Pipeline/Proyectos, not a parallel
-- entity) and adds a minimal `companies` table so a company can be shared
-- across multiple clients/contacts — inspired by Twenty CRM's
-- Company <-> Person relationship, reimplemented from scratch for this
-- Next.js/Supabase stack (Twenty itself is AGPL-3.0 and a different stack,
-- not reused as code).
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_companies_workspace_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_companies_workspace ON companies(workspace_id);

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read companies"
  ON companies FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write companies"
  ON companies FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_status TEXT DEFAULT 'potencial' NOT NULL
  CHECK (client_status IN ('activo', 'potencial', 'archivado'));

CREATE INDEX IF NOT EXISTS idx_contacts_client_status ON contacts(workspace_id, client_status);
CREATE INDEX IF NOT EXISTS idx_contacts_company        ON contacts(workspace_id, company_id);

-- ============================================================
-- End of migration: 20260713000100_clientes_crm
-- ============================================================
