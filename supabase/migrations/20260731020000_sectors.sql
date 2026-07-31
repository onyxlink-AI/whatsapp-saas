-- ============================================================
-- Migration: 20260731020000_sectors
-- "Sector" tag for Pipeline opportunities and Clientes contacts — a Notion-
-- style creatable select: the admin types a value, it's found-or-created
-- and persists as a reusable option from then on. Same shape and RLS as
-- `companies` (see 20260713000100_clientes_crm.sql), just a different
-- concept (business niche, not a company name).
-- ============================================================

CREATE TABLE IF NOT EXISTS sectors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_sectors_workspace_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sectors_workspace ON sectors(workspace_id);

ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read sectors"
  ON sectors FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write sectors"
  ON sectors FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- Starting list of niches, seeded for every existing workspace. Admins can
-- add more later just by typing a new one in the Sector field — nothing
-- limits sectors to this initial list.
INSERT INTO sectors (workspace_id, name)
SELECT w.id, n.name
FROM workspaces w
CROSS JOIN (VALUES
  ('Dentistas'),
  ('Formadores'),
  ('Centros de tatuajes'),
  ('Gimnasios'),
  ('Deporte al aire libre'),
  ('Talleres de móviles y ordenadores'),
  ('Empresas de experiencias'),
  ('Barberías grandes'),
  ('Inmobiliarias'),
  ('Spas'),
  ('Alquiler de coches o motos'),
  ('Náutica'),
  ('Agencias de viajes'),
  ('Psicólogos'),
  ('Fisioterapia'),
  ('Limpieza de coches')
) AS n(name)
ON CONFLICT (workspace_id, name) DO NOTHING;

-- ============================================================
-- End of migration: 20260731020000_sectors
-- ============================================================
