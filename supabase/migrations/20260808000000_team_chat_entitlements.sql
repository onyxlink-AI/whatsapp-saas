-- ============================================================
-- Migration: 20260808000000_team_chat_entitlements
-- Fase A del Chat de equipo (docs/ONYXLINK-ARQUITECTURA-CHAT-BIBLIOTECA-SEGURIDAD.md):
-- entitlements de plazas humanas + endurecimiento de la lectura de `users` +
-- reserva transaccional de plaza. El chat en sí (Fase B) vive en la
-- siguiente migración; esta es deliberadamente independiente porque el
-- límite de plazas gobierna `memberships` en general (lo usa hoy mismo el
-- flujo de invitar/reactivar en /api/workspace/[id]/team), no solo el chat.
-- ============================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS team_chat_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS human_member_limit SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_human_member_limit_range;
ALTER TABLE workspaces
  ADD CONSTRAINT chk_human_member_limit_range CHECK (human_member_limit BETWEEN 1 AND 500);

-- ---------------------------------------------------------------------------
-- Revisión de arquitectura (docs/CLAUDE-REVISION-CHAT-FASE-1.md, bloqueo 6):
-- el DEFAULT 1 de arriba deja a cualquier workspace YA EXISTENTE con 2+
-- miembros humanos activos por debajo de su propio cupo en el instante en
-- que esta migración se aplica — bloquearía invitar o reactivar a nadie más
-- hasta que un superadmin lo suba a mano, rompiendo operación existente al
-- desplegar. Backfill conservador, una sola vez, para las filas que ya
-- existen en este punto: nunca por debajo del número de miembros humanos
-- activos actuales, y nunca por debajo del mínimo comercial del paquete
-- contratado (Gestión=1, WhatsApp=2, Suite=4 — mismos umbrales que
-- products/package_tier en src/features/agency/services/agency-actions.ts).
-- Los workspaces creados DESPUÉS de esta migración no necesitan este
-- backfill — createWorkspaceForClient() les asigna el default contractual
-- directamente según el paquete elegido al alta.
-- ---------------------------------------------------------------------------

-- Función reutilizable (no un bloque DO desechable) a propósito: así la
-- prueba de la revisión ("workspace existente con 2+ miembros antes de la
-- migración") llama exactamente esta misma lógica, no una reimplementación
-- en el test que podría divergir en silencio del comportamiento real.
CREATE OR REPLACE FUNCTION public.team_chat_backfill_seat_limit(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_human_count INT;
  v_commercial_minimum SMALLINT;
BEGIN
  SELECT count(*) INTO v_active_human_count
  FROM public.memberships m
  JOIN public.users u ON u.id = m.user_id
  WHERE m.workspace_id = p_workspace_id AND m.is_active = TRUE AND u.is_super_admin = FALSE;

  SELECT CASE
    WHEN w.whatsapp_agent_enabled AND w.office_virtual_enabled THEN 4::SMALLINT
    WHEN w.whatsapp_agent_enabled THEN 2::SMALLINT
    WHEN w.gestion_enabled THEN 1::SMALLINT
    ELSE 1::SMALLINT
  END INTO v_commercial_minimum
  FROM public.workspaces w
  WHERE w.id = p_workspace_id;

  UPDATE public.workspaces
  SET human_member_limit = GREATEST(human_member_limit, v_active_human_count, COALESCE(v_commercial_minimum, 1))
  WHERE id = p_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.team_chat_backfill_seat_limit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_chat_backfill_seat_limit(UUID) TO service_role;

-- Backfill de una sola vez, aplicado a cada workspace que existe en este
-- punto exacto de la migración. Los workspaces creados DESPUÉS no pasan por
-- aquí — createWorkspaceForClient() les asigna el default contractual
-- directamente según el paquete elegido al alta.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM workspaces LOOP
    PERFORM public.team_chat_backfill_seat_limit(r.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Endurecer la lectura de `users` (20260608000000_foundation.sql):
--
--   CREATE POLICY "users_select_authenticated" ON users FOR SELECT
--     USING (auth.uid() IS NOT NULL);
--
-- Esa política es intencionalmente global desde el día 1 (cualquier
-- autenticado ve TODOS los perfiles de `users`, sin importar workspace) — un
-- IDOR de enumeración de perfiles ajenos que el Chat de equipo convierte de
-- "molesto" a "crítico": el chat necesita mostrar nombre/avatar de
-- compañeros de equipo vía `users`, y con la política vieja cualquier
-- cliente de OnyxLink podría enumerar los perfiles de TODOS los clientes de
-- TODAS las demás empresas del panel. La arquitectura del Chat exige
-- corregir esto antes o durante esta fase (sección 5). Reemplazo: propio
-- perfil, perfiles de usuarios que comparten un workspace activo, o
-- superadministrador — igual que ya hace `memberships_select_members` para
-- su propia tabla.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users_select_authenticated" ON users;
CREATE POLICY "users_select_scoped"
  ON users FOR SELECT
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR id IN (
      SELECT m2.user_id
      FROM memberships m1
      JOIN memberships m2 ON m2.workspace_id = m1.workspace_id AND m2.is_active = TRUE
      WHERE m1.user_id = auth.uid() AND m1.is_active = TRUE
    )
  );

-- ---------------------------------------------------------------------------
-- claim_workspace_seat — reserva transaccional de plaza para
-- invitar/reactivar un miembro. Un conteo hecho en React o en la API antes
-- del INSERT no es suficiente (lo advierte la propia arquitectura): dos
-- invitaciones concurrentes leerían el mismo conteo "por debajo del límite"
-- y ambas pasarían. `SELECT ... FOR UPDATE` sobre la fila de `workspaces`
-- serializa a cualquier llamada concurrente para el MISMO workspace — la
-- segunda espera a que la primera termine su transacción y entonces cuenta
-- de nuevo con el INSERT/UPDATE de la primera ya visible.
--
-- Los superadministradores de OnyxLink nunca consumen plaza (sección 3 de
-- la arquitectura) — si el usuario destino es superadmin, se salta el
-- conteo por completo.
--
-- SECURITY DEFINER porque `memberships`/`workspaces` tienen RLS y esta
-- función necesita leer/escribir sin las restricciones normales de un
-- cliente — la autorización real (¿puede ESTE llamador invitar en ESTE
-- workspace?) ya la hace `requireWorkspaceMember(..., {minRole:"manager"})`
-- en la ruta API *antes* de invocar esta función con el cliente service-role
-- (ver GRANT más abajo: solo service_role, nunca authenticated/anon
-- directamente — mismo patrón que publish_prompt_version_rpc.sql).
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

    -- Solo cuenta si esta llamada va a CONSUMIR una plaza nueva (alta o
    -- reactivación); si ya estaba activo, cambiar de rol no consume nada.
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
END;
$$;
-- Redefinida en 20260808000001_team_chat_schema.sql para además dar de alta
-- al miembro en el canal General cuando el Chat ya está activo — esta
-- migración no conoce todavía las tablas del chat (se crean después), así
-- que se mantiene deliberadamente ajena a ellas aquí.

REVOKE ALL ON FUNCTION public.claim_workspace_seat(UUID, UUID, public.workspace_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_workspace_seat(UUID, UUID, public.workspace_role) TO service_role;

-- ============================================================
-- End of migration: 20260808000000_team_chat_entitlements
-- ============================================================
