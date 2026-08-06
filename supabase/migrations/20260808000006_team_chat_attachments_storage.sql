-- ============================================================
-- Migration: 20260808000005_team_chat_attachments_storage
-- Fase 2 del Chat de equipo — documentos privados
-- (docs/CLAUDE-TAREA-MAESTRA-CHAT-EQUIPO.md,
-- docs/ONYXLINK-ARQUITECTURA-CHAT-BIBLIOTECA-SEGURIDAD.md sección 6.1).
--
-- Bucket privado `team-chat-files`. Path: {workspace_id}/{channel_id}/
-- {message_id}/{uuid}-{safe_name} — igual convención que whatsapp-media
-- (20260608000007), pero con un segmento extra (message_id) porque cada
-- adjunto pertenece a un único mensaje "contenedor" en team_messages.
--
-- La cuarentena se aplica en RLS, no solo en la UI: la policy SELECT de
-- `authenticated` exige scan_status='clean' en team_message_attachments —
-- así que ni siquiera una URL firmada generada con la sesión del propio
-- usuario (no service role) podría servir un archivo todavía no escaneado o
-- ya rechazado/infectado. La descarga real de la app pasa por
-- getAttachmentDownloadUrl() con service role (bypass de RLS por diseño,
-- igual que getSignedUrl() en media-handler.ts), pero esta policy es la
-- frontera real para cualquier otro camino que llegue a tocar Storage con
-- una sesión de usuario.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-chat-files',
  'team-chat-files',
  false,
  10485760, -- 10 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- service_role: acceso total (usado por finalizeAttachmentUpload() para
-- descargar/re-verificar bytes y borrar en cuarentena, y por
-- getAttachmentDownloadUrl() para firmar URLs de vida corta).
DROP POLICY IF EXISTS "service_role_upload_team_chat_files" ON storage.objects;
CREATE POLICY "service_role_upload_team_chat_files"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'team-chat-files');

DROP POLICY IF EXISTS "service_role_read_team_chat_files" ON storage.objects;
CREATE POLICY "service_role_read_team_chat_files"
  ON storage.objects FOR SELECT TO service_role
  USING (bucket_id = 'team-chat-files');

DROP POLICY IF EXISTS "service_role_delete_team_chat_files" ON storage.objects;
CREATE POLICY "service_role_delete_team_chat_files"
  ON storage.objects FOR DELETE TO service_role
  USING (bucket_id = 'team-chat-files');

-- authenticated INSERT: sube el propio usuario, con su propia sesión (nunca
-- service role) — la policy es la barrera real, igual que project-covers
-- (20260806000000). Tres condiciones, las tres necesarias:
--   1. El segmento workspace_id del path es un workspace del que el
--      llamador es miembro (auth_workspace_ids()).
--   2. El segmento channel_id del path es un canal en el que el llamador
--      participa de verdad (auth_team_channel_ids() — no basta ser
--      miembro del workspace, ver comentario de esa función).
--   3. Existe una fila en team_message_attachments con ESE object_path
--      exacto y uploader_id = auth.uid(), creada de antemano por
--      begin_team_attachment_upload(). Sin esto, cualquier participante
--      del canal podría subir bytes arbitrarios a cualquier ruta bajo el
--      prefijo del canal sin pasar por la cuota ni quedar asociada a un
--      mensaje — el path por sí solo no basta como prueba de autorización.
DROP POLICY IF EXISTS "member_upload_team_chat_files" ON storage.objects;
CREATE POLICY "member_upload_team_chat_files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-chat-files'
    AND (split_part(name, '/', 1))::uuid IN (SELECT auth_workspace_ids())
    AND (split_part(name, '/', 2))::uuid IN (SELECT auth_team_channel_ids())
    AND EXISTS (
      SELECT 1 FROM public.team_message_attachments tma
      WHERE tma.object_path = name AND tma.uploader_id = auth.uid()
    )
  );

-- authenticated SELECT: cuarentena real en RLS — solo si el archivo ya
-- pasó el escaneo (scan_status='clean'), además de participar en el canal.
DROP POLICY IF EXISTS "member_read_clean_team_chat_files" ON storage.objects;
CREATE POLICY "member_read_clean_team_chat_files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'team-chat-files'
    AND (split_part(name, '/', 2))::uuid IN (SELECT auth_team_channel_ids())
    AND EXISTS (
      SELECT 1 FROM public.team_message_attachments tma
      WHERE tma.object_path = name AND tma.scan_status = 'clean'
    )
  );

-- ============================================================
-- End of migration: 20260808000005_team_chat_attachments_storage
-- ============================================================
