-- ============================================================
-- Migration: 20260808000004_team_chat_custom_channels
-- Canales personalizados del Chat de equipo: cualquier miembro activo del
-- workspace puede crear un canal nuevo (p. ej. "Marketing", "Delegar
-- trabajo"), abierto a todo el workspace desde el momento en que se crea —
-- no privado por invitación (decisión confirmada con el usuario). Se
-- comporta exactamente como 'general' de cara a RLS/Realtime (ambos
-- dependen únicamente de tener fila en team_channel_members), la única
-- diferencia es que puede haber varios y los crea cualquiera, no el sistema.
-- Requiere 20260808000003_team_chat_custom_channel_kind.sql aplicada antes
-- (el valor 'custom' del enum no puede usarse en la misma transacción en
-- que se creó).
-- ============================================================

ALTER TABLE team_channels DROP CONSTRAINT IF EXISTS chk_team_channels_direct_key;
ALTER TABLE team_channels ADD CONSTRAINT chk_team_channels_direct_key CHECK (
  (kind = 'direct' AND direct_key IS NOT NULL) OR
  (kind IN ('general', 'custom') AND direct_key IS NULL)
);

-- Evita dos canales con el mismo nombre (case-insensitive) en el mismo
-- workspace — confusión real cuando cualquiera puede crear uno.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_channels_custom_name
  ON team_channels(workspace_id, lower(name)) WHERE kind = 'custom';

-- ---------------------------------------------------------------------------
-- create_team_channel — mismo patrón anti-IDOR que get_or_create_dm_channel:
-- deriva el creador de auth.uid(), nunca de un parámetro del cliente (si
-- aceptara un "creado por" del payload, cualquiera podría atribuir la
-- creación a otro usuario). Backfill inmediato de todos los miembros
-- activos actuales del workspace — 'custom' es "abierto a todo el
-- workspace" igual que 'general', no requiere unirse explícitamente.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_team_channel(
  p_workspace_id UUID,
  p_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_name TEXT := trim(p_name);
  v_channel_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF char_length(v_name) < 1 OR char_length(v_name) > 60 THEN
    RAISE EXCEPTION 'channel name must be between 1 and 60 characters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND team_chat_enabled = TRUE
  ) THEN
    RAISE EXCEPTION 'team chat is not enabled for this workspace';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = p_workspace_id AND user_id = v_caller AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'caller is not an active member of this workspace';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_channels
    WHERE workspace_id = p_workspace_id AND kind = 'custom' AND lower(name) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'CHANNEL_NAME_TAKEN' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.team_channels (workspace_id, name, kind, created_by)
  VALUES (p_workspace_id, v_name, 'custom', v_caller)
  RETURNING id INTO v_channel_id;

  INSERT INTO public.team_channel_members (channel_id, workspace_id, user_id, joined_at, last_read_at)
  SELECT v_channel_id, p_workspace_id, m.user_id, now(), now()
  FROM public.memberships m
  WHERE m.workspace_id = p_workspace_id AND m.is_active = TRUE
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN v_channel_id;
END;
$$;

-- Lección de 20260808000002_team_chat_security_definer_grants_fix.sql:
-- REVOKE ALL ... FROM PUBLIC no basta en este proyecto de Supabase para
-- bloquear anon — hay que revocarlo de forma explícita desde el primer
-- commit, no como parche posterior.
REVOKE ALL ON FUNCTION public.create_team_channel(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_channel(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- claim_workspace_seat — redefinición: quien se una (o reactive) DESPUÉS de
-- que existan canales personalizados también debe entrar a todos ellos, no
-- solo a General, para que "abierto a todo el workspace" siga siendo
-- cierto con el tiempo. Cuerpo idéntico al de 20260808000001, cambiando
-- únicamente el WHERE del backfill de canales.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_workspace_seat(
  p_workspace_id UUID,
  p_user_id UUID,
  p_role public.workspace_role
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit SMALLINT;
  v_count INT;
  v_is_superadmin BOOLEAN;
  v_already_active BOOLEAN;
BEGIN
  SELECT human_member_limit INTO v_limit
  FROM public.workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'workspace % not found', p_workspace_id;
  END IF;

  SELECT COALESCE(is_super_admin, FALSE) INTO v_is_superadmin
  FROM public.users
  WHERE id = p_user_id;

  IF NOT COALESCE(v_is_superadmin, FALSE) THEN
    SELECT is_active INTO v_already_active
    FROM public.memberships
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id;

    IF v_already_active IS DISTINCT FROM TRUE THEN
      SELECT count(*) INTO v_count
      FROM public.memberships m
      JOIN public.users u ON u.id = m.user_id
      WHERE m.workspace_id = p_workspace_id
        AND m.is_active = TRUE
        AND u.is_super_admin = FALSE;

      IF v_count >= v_limit THEN
        RAISE EXCEPTION 'TEAM_SEAT_LIMIT_REACHED' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.memberships (workspace_id, user_id, role, is_active, updated_at)
  VALUES (p_workspace_id, p_user_id, p_role, TRUE, now())
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = TRUE, updated_at = now();

  -- Antes solo 'general'; ahora también todo canal 'custom' existente —
  -- ver comentario de cabecera.
  INSERT INTO public.team_channel_members (channel_id, workspace_id, user_id, joined_at, last_read_at)
  SELECT tc.id, p_workspace_id, p_user_id, now(), now()
  FROM public.team_channels tc
  WHERE tc.workspace_id = p_workspace_id AND tc.kind IN ('general', 'custom')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_workspace_seat(UUID, UUID, public.workspace_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_seat(UUID, UUID, public.workspace_role) TO service_role;

-- ---------------------------------------------------------------------------
-- Cierre del hueco de bajo riesgo detectado en la revisión de seguridad de
-- esta misma sesión: auth_team_channel_ids() y get_or_create_dm_channel()
-- eran también ejecutables por anon (sin causar daño real porque ambas
-- comprueban auth.uid() IS NULL internamente y devuelven vacío/rechazan),
-- pero deben quedar cerradas igual que el resto — nunca confiar en que la
-- comprobación interna sea la única barrera.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.auth_team_channel_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_team_channel_ids() TO authenticated;

REVOKE ALL ON FUNCTION public.get_or_create_dm_channel(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_channel(UUID, UUID) TO authenticated;

-- ============================================================
-- End of migration: 20260808000003_team_chat_custom_channels
-- ============================================================
