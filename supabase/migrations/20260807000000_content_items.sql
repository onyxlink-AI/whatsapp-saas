-- ============================================================
-- Migration: 20260807000000_content_items
-- Fase 3 del roadmap comercial: módulo Contenido (Ideas, Guiones, Pipeline,
-- Teleprompter). Una sola tabla para toda la pieza de contenido — "Ideas" y
-- "Guiones" no son entidades separadas, son vistas distintas sobre la misma
-- fila (una idea es una fila en status='idea'; "convertir a guion" es solo
-- avanzar status y rellenar los campos de guion) — así lo describe el propio
-- roadmap ("Convertir una idea en contenido o guion"). Las métricas van en
-- la misma fila (no una tabla de serie temporal): el roadmap solo pide poder
-- "registrar" métricas posteriores a la publicación, no un histórico.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE content_status AS ENUM (
    'idea', 'in_production', 'ready_to_publish', 'published'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE content_orientation AS ENUM ('vertical', 'horizontal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS content_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  responsible_id  UUID REFERENCES users(id) ON DELETE SET NULL,

  title           TEXT NOT NULL DEFAULT 'Sin título',
  main_idea       TEXT,
  description     TEXT,
  content_type    TEXT,
  platform        TEXT,
  orientation     content_orientation,

  -- Guion
  script_hook     TEXT,
  script_body     TEXT,
  script_closing  TEXT,
  script_cta      TEXT,
  bullet_points   JSONB NOT NULL DEFAULT '[]'::jsonb,
  reference_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes           TEXT,
  lighting_notes  TEXT,
  music_notes     TEXT,
  duration_estimate TEXT,

  status          content_status NOT NULL DEFAULT 'idea',
  position        INT NOT NULL DEFAULT 0,
  scheduled_date  DATE,
  published_at    TIMESTAMPTZ,

  -- Métricas manuales (solo tras publicar; nunca vía API de redes)
  metric_views    INT,
  metric_reach    INT,
  metric_likes    INT,
  metric_comments INT,
  metric_shares   INT,
  metric_saves    INT,
  metric_clicks   INT,
  metric_leads    INT,
  metric_notes    TEXT,

  CONSTRAINT chk_content_metrics_nonnegative CHECK (
    (metric_views IS NULL OR metric_views >= 0) AND
    (metric_reach IS NULL OR metric_reach >= 0) AND
    (metric_likes IS NULL OR metric_likes >= 0) AND
    (metric_comments IS NULL OR metric_comments >= 0) AND
    (metric_shares IS NULL OR metric_shares >= 0) AND
    (metric_saves IS NULL OR metric_saves >= 0) AND
    (metric_clicks IS NULL OR metric_clicks >= 0) AND
    (metric_leads IS NULL OR metric_leads >= 0)
  ),

  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_items_workspace ON content_items(workspace_id, status, position);
CREATE INDEX IF NOT EXISTS idx_content_items_project ON content_items(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_content_items_responsible ON content_items(workspace_id, responsible_id);

-- Las FK simples garantizan que proyecto/usuario existen, pero no que
-- pertenezcan a la misma empresa. Este trigger cierra ese hueco también para
-- escrituras directas por REST/SQL, no solo para las server actions del panel.
CREATE OR REPLACE FUNCTION validate_content_item_workspace_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = NEW.project_id AND workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'content project must belong to the same workspace';
  END IF;

  IF NEW.responsible_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = NEW.responsible_id
      AND workspace_id = NEW.workspace_id
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'content responsible must be an active workspace member';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_items_workspace_relations ON content_items;
CREATE TRIGGER trg_content_items_workspace_relations
  BEFORE INSERT OR UPDATE OF workspace_id, project_id, responsible_id
  ON content_items
  FOR EACH ROW EXECUTE FUNCTION validate_content_item_workspace_relations();

DROP TRIGGER IF EXISTS trg_content_items_updated_at ON content_items;
CREATE TRIGGER trg_content_items_updated_at
  BEFORE UPDATE ON content_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read content_items"
  ON content_items FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write content_items"
  ON content_items FOR ALL
  USING (workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[]))
  WITH CHECK (workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[]));

-- ============================================================
-- End of migration: 20260807000000_content_items
-- ============================================================
