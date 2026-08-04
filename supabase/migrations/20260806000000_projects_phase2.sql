-- ============================================================
-- Migration: 20260806000000_projects_phase2
-- Fase 2 del roadmap comercial: proyectos ganan estado activo/inactivo
-- (independiente del status de kanban) e imagen de portada guardada en
-- Supabase Storage (bucket `project-covers`, ver también esta migración).
-- Ambas columnas son aditivas con default seguro — no rompen filas
-- existentes ni el feature de Fase 1.
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cover_image_path TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(workspace_id, is_active);

-- ---------------------------------------------------------------------------
-- Storage: bucket de portadas de proyecto.
--
-- A diferencia de `whatsapp-media` (privado + signed URLs, pensado para
-- adjuntos entrantes vía webhook), las portadas son imágenes decorativas de
-- baja sensibilidad que se listan en cuadrícula (Bento grid) — usar URLs
-- firmadas ahí obligaría a firmar decenas de URLs por carga de página. Se
-- opta por un bucket PÚBLICO con path `{workspace_id}/{project_id}/...`,
-- manteniendo el mismo criterio de escritura restringida por rol que el
-- resto del esquema (auth_has_role).
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-covers', 'project-covers', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public read project covers" ON storage.objects;
CREATE POLICY "public read project covers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-covers');

DROP POLICY IF EXISTS "ws operators upload project covers" ON storage.objects;
CREATE POLICY "ws operators upload project covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-covers'
    AND (split_part(name, '/', 1))::uuid IN (SELECT auth_workspace_ids())
    AND auth_has_role((split_part(name, '/', 1))::uuid, ARRAY['admin', 'manager', 'agent']::workspace_role[])
  );

DROP POLICY IF EXISTS "ws operators update project covers" ON storage.objects;
CREATE POLICY "ws operators update project covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-covers'
    AND (split_part(name, '/', 1))::uuid IN (SELECT auth_workspace_ids())
  )
  WITH CHECK (
    bucket_id = 'project-covers'
    AND auth_has_role((split_part(name, '/', 1))::uuid, ARRAY['admin', 'manager', 'agent']::workspace_role[])
  );

DROP POLICY IF EXISTS "ws operators delete project covers" ON storage.objects;
CREATE POLICY "ws operators delete project covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-covers'
    AND auth_has_role((split_part(name, '/', 1))::uuid, ARRAY['admin', 'manager', 'agent']::workspace_role[])
  );

-- ============================================================
-- End of migration: 20260806000000_projects_phase2
-- ============================================================
