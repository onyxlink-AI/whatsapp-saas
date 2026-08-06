-- ============================================================
-- Migration: 20260808000005_team_chat_attachments_schema
-- Fase 2 del Chat de equipo — documentos privados
-- (docs/CLAUDE-TAREA-MAESTRA-CHAT-EQUIPO.md,
-- docs/ONYXLINK-ARQUITECTURA-CHAT-BIBLIOTECA-SEGURIDAD.md sección 6.1).
--
-- team_message_attachments + cuota mensual por workspace +
-- begin_team_attachment_upload()/finalize_team_attachment_scan(). Debe
-- aplicarse ANTES de 20260808000006 (RLS de storage.objects que consulta
-- esta tabla).
--
-- Lección de la incidencia de seguridad de esta sesión
-- (20260808000002_team_chat_security_definer_grants_fix.sql): en este
-- proyecto de Supabase, REVOKE ALL ... FROM PUBLIC por sí solo NO basta
-- para bloquear a anon/authenticated en una función SECURITY DEFINER — hay
-- que revocar explícitamente también de anon (y de authenticated cuando no
-- deba ejecutarla directamente). Ambas funciones de aquí abajo lo aplican
-- desde este primer commit, no como parche posterior.
-- ============================================================

-- ---------------------------------------------------------------------------
-- workspaces.team_chat_storage_quota_mb — cuota mensual de subida por
-- workspace, edición exclusiva de superadmin (mismo patrón que
-- human_member_limit).
-- ---------------------------------------------------------------------------

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS team_chat_storage_quota_mb SMALLINT NOT NULL DEFAULT 500;

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_team_chat_storage_quota_mb_range;
ALTER TABLE workspaces
  ADD CONSTRAINT chk_team_chat_storage_quota_mb_range CHECK (team_chat_storage_quota_mb BETWEEN 1 AND 51200);

-- ---------------------------------------------------------------------------
-- team_message_attachments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_message_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id     UUID NOT NULL REFERENCES team_channels(id) ON DELETE CASCADE,
  message_id     UUID NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  uploader_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_path    TEXT NOT NULL UNIQUE,
  file_name      TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  declared_mime  TEXT NOT NULL,
  detected_mime  TEXT,
  byte_size      INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  sha256_hash    TEXT,
  scan_status    TEXT NOT NULL DEFAULT 'pending'
                   CHECK (scan_status IN ('pending', 'clean', 'infected', 'rejected', 'error')),
  scan_provider  TEXT,
  scanned_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_message_attachments_message ON team_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_team_message_attachments_channel ON team_message_attachments(channel_id);

-- Cuota mensual: SUM(byte_size) de un workspace desde el inicio del mes en
-- curso — mismo estilo que el rate limit de sendMessage() (contar/sumar
-- filas de la propia tabla en una ventana, sin tabla de contadores
-- dedicada).
CREATE INDEX IF NOT EXISTS idx_team_message_attachments_quota
  ON team_message_attachments(workspace_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE team_message_attachments ENABLE ROW LEVEL SECURITY;

-- Solo lectura, y solo de adjuntos en canales donde el usuario participa de
-- verdad — mismo criterio que team_messages_select_participant. No hay
-- filtro por scan_status aquí: el bubble necesita ver el estado
-- "pending"/"rejected"/"infected" para poder mostrar "Analizando…" o
-- "Archivo rechazado"; la cuarentena real (bloquear la descarga de bytes)
-- vive en la RLS de storage.objects (20260808000006), no aquí.
CREATE POLICY "team_message_attachments_select_participant"
  ON team_message_attachments FOR SELECT
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND channel_id IN (SELECT auth_team_channel_ids())
  );

-- Ninguna escritura de cliente: toda inserción/actualización pasa por las
-- funciones SECURITY DEFINER de abajo.
REVOKE INSERT, UPDATE, DELETE ON team_message_attachments FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- begin_team_attachment_upload — reserva atómica: valida membership activa
-- + team_chat_enabled + tipo permitido + tamaño, bloquea la fila de
-- workspaces FOR UPDATE (mismo patrón que claim_workspace_seat()) y suma
-- los bytes ya subidos este mes contra la cuota; si todo pasa, crea en la
-- misma transacción el mensaje "contenedor" en team_messages y la fila de
-- team_message_attachments en 'pending'. Deriva el llamador de auth.uid()
-- internamente (nunca de un parámetro) — mismo motivo anti-IDOR que
-- create_team_channel()/get_or_create_dm_channel().
--
-- La allowlist de MIME declarado se repite aquí (además de en el bucket de
-- Storage) porque begin_team_attachment_upload() corre ANTES de que
-- exista ningún objeto en Storage — rechazar aquí evita reservar cuota y
-- crear filas de mensaje/adjunto para una subida que el bucket iba a
-- rechazar de todos modos.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.begin_team_attachment_upload(
  p_channel_id UUID,
  p_file_name TEXT,
  p_declared_mime TEXT,
  p_byte_size INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_workspace_id UUID;
  v_quota_mb SMALLINT;
  v_used_bytes BIGINT;
  v_safe_name TEXT;
  v_message_id UUID;
  v_attachment_id UUID;
  v_object_path TEXT;
  v_allowed_mimes CONSTANT TEXT[] := ARRAY[
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
  ];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_declared_mime IS NULL OR NOT (p_declared_mime = ANY(v_allowed_mimes)) THEN
    RAISE EXCEPTION 'UNSUPPORTED_FILE_TYPE';
  END IF;

  IF p_byte_size IS NULL OR p_byte_size < 1 OR p_byte_size > 10485760 THEN
    RAISE EXCEPTION 'FILE_TOO_LARGE';
  END IF;

  IF p_file_name IS NULL OR char_length(p_file_name) < 1 THEN
    RAISE EXCEPTION 'invalid file name';
  END IF;

  SELECT tc.workspace_id INTO v_workspace_id
  FROM public.team_channels tc
  WHERE tc.id = p_channel_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'channel % not found', p_channel_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_channel_members
    WHERE channel_id = p_channel_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'caller is not a participant of this channel';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = v_workspace_id AND user_id = v_caller AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'caller is not an active member of this workspace';
  END IF;

  -- Bloquea la fila del workspace (mismo patrón que claim_workspace_seat())
  -- para que dos subidas concurrentes no puedan las dos leer "todavía hay
  -- cuota" y colarse juntas por encima del límite.
  SELECT team_chat_storage_quota_mb INTO v_quota_mb
  FROM public.workspaces
  WHERE id = v_workspace_id AND team_chat_enabled = TRUE
  FOR UPDATE;

  IF v_quota_mb IS NULL THEN
    RAISE EXCEPTION 'team chat is not enabled for this workspace';
  END IF;

  SELECT COALESCE(SUM(byte_size), 0) INTO v_used_bytes
  FROM public.team_message_attachments
  WHERE workspace_id = v_workspace_id
    AND created_at >= date_trunc('month', now())
    AND scan_status <> 'rejected';

  IF v_used_bytes + p_byte_size > (v_quota_mb::BIGINT * 1048576) THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED';
  END IF;

  v_safe_name := regexp_replace(p_file_name, '[^a-zA-Z0-9._-]', '_', 'g');

  INSERT INTO public.team_messages (workspace_id, channel_id, sender_id, body)
  VALUES (v_workspace_id, p_channel_id, v_caller, left('📎 ' || p_file_name, 4000))
  RETURNING id INTO v_message_id;

  v_object_path := v_workspace_id::text || '/' || p_channel_id::text || '/' || v_message_id::text
    || '/' || gen_random_uuid()::text || '-' || v_safe_name;

  INSERT INTO public.team_message_attachments (
    workspace_id, channel_id, message_id, uploader_id, object_path,
    file_name, declared_mime, byte_size, scan_status
  )
  VALUES (
    v_workspace_id, p_channel_id, v_message_id, v_caller, v_object_path,
    p_file_name, p_declared_mime, p_byte_size, 'pending'
  )
  RETURNING id INTO v_attachment_id;

  RETURN jsonb_build_object(
    'messageId', v_message_id,
    'attachmentId', v_attachment_id,
    'objectPath', v_object_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_team_attachment_upload(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_team_attachment_upload(UUID, TEXT, TEXT, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel_team_attachment_upload — la subida de bytes ocurre directamente
-- desde el navegador a Storage (nunca por el servidor de la app), así que
-- puede fallar a mitad por una red inestable sin que el servidor se entere.
-- Sin esta función, ese adjunto se quedaría en 'pending' ("Analizando
-- archivo…") para siempre, porque finalizeAttachmentUpload() nunca tendría
-- bytes que descargar. Solo el propio uploader puede cancelar su propia
-- subida todavía pendiente — nunca un adjunto ya escaneado (evita que se
-- pueda "ocultar" un resultado ya conocido volviendo a 'error').
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_team_attachment_upload(
  p_attachment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.team_message_attachments
  SET scan_status = 'error', scanned_at = now()
  WHERE id = p_attachment_id AND uploader_id = v_caller AND scan_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attachment % not found or not cancellable', p_attachment_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_team_attachment_upload(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_team_attachment_upload(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- finalize_team_attachment_scan — la llama únicamente la Server Action tras
-- hablar con el proveedor de escaneo antimalware (nunca el cliente
-- directamente): actualiza detected_mime/sha256_hash/scan_status/
-- scan_provider/scanned_at para un adjunto ya reservado por
-- begin_team_attachment_upload(). service_role, no authenticated — la
-- decisión "está limpio o no" nunca debe poder tomarla el cliente.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_team_attachment_scan(
  p_attachment_id UUID,
  p_detected_mime TEXT,
  p_sha256_hash TEXT,
  p_scan_status TEXT,
  p_scan_provider TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_scan_status NOT IN ('clean', 'infected', 'rejected', 'error') THEN
    RAISE EXCEPTION 'invalid scan_status %', p_scan_status;
  END IF;

  UPDATE public.team_message_attachments
  SET
    detected_mime = p_detected_mime,
    sha256_hash = p_sha256_hash,
    scan_status = p_scan_status,
    scan_provider = p_scan_provider,
    scanned_at = now()
  WHERE id = p_attachment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attachment % not found', p_attachment_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_team_attachment_scan(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_team_attachment_scan(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- End of migration: 20260808000005_team_chat_attachments_schema
-- ============================================================
