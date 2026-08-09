-- ============================================================
-- Migration: 20260809000000_assistant_confirmable_actions
-- Fase 4B del roadmap comercial
-- (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §6.3):
-- infraestructura de confirmación de dos pasos para acciones destructivas
-- del Asistente de Ayuda, y la primera acción real que la usa: cancelar un
-- elemento de Agenda (reversible mediante restauración, nunca borrado
-- físico).
--
-- Decisiones cerradas por el usuario para esta fase (no improvisadas):
--   - Agenda: cancelled_at/cancelled_by, NUNCA DELETE FROM agenda_tasks
--     desde el asistente. La cancelación es reversible.
--   - Anotaciones: sin cambios — archive_note/restaurar siguen siendo la
--     única vía, ya reversible, ya sin necesidad de este flujo.
--   - El token de confirmación viaja en texto plano al navegador UNA sola
--     vez y nunca se guarda así — la tabla solo almacena su SHA-256. Ni
--     esta migración ni ningún código de servidor debe volver a insertar
--     el token en claro en ninguna columna, log o metadata de auditoría.
--   - Resolución (confirmar/cancelar) en una única función SECURITY
--     DEFINER transaccional: localizar por hash, bloquear FOR UPDATE,
--     comprobar workspace/actor/estado/caducidad, re-validar membership+
--     paquete+kill switch DENTRO de la misma transacción, ejecutar el
--     único caso permitido (lista cerrada, sin SQL dinámico) y marcar el
--     estado final — nunca "pending -> confirmed" seguido de una
--     ejecución aparte desde Node, que dejaría una ventana entre marcar y
--     ejecutar donde una caída deja el estado inconsistente.
--
-- Revisión correctiva (misma sesión, antes de cualquier commit):
--   - El límite de intentos de confirmación (defensa contra enumeración)
--     pasa de "SELECT count -> INSERT" desde Node (TOCTOU, fail-open) a
--     reserve_help_assistant_confirm_attempt(), mismo patrón de advisory
--     lock atómico que reserve_content_script_generation()
--     (20260808000008) — cuenta y reserva en una sola llamada de Postgres,
--     fail-closed si la propia reserva falla.
--   - resolve_assistant_pending_action() ahora devuelve pending_action_id
--     en TODAS las ramas (para que prepared/executed/cancelled compartan
--     un identificador de auditoría común) y, cuando la fila ya no está
--     'pending', también el status final real (final_status) — así un
--     reintento tras perder la respuesta de red puede reconciliar un
--     'executed'/'cancelled' ya ocurrido como éxito, en vez de un error
--     falso. Nunca se alcanza esa rama para un actor/workspace distinto
--     del que preparó la acción (sigue devolviendo 'invalid_token').
--   - Antes de castear payload->>'agenda_task_id' a uuid, la función
--     valida explícitamente forma exacta del JSON (objeto con
--     EXACTAMENTE la clave agenda_task_id, valor string, formato UUID) —
--     un payload corrupto o manipulado marca la fila 'failed' con un
--     código interno, nunca lanza una excepción de casting ni la deja
--     'pending' para siempre.
--
-- REVOKE explícito de anon Y authenticated desde el primer commit — misma
-- lección de seguridad que set_workspace_product_package() (20260808000002):
-- REVOKE ALL ... FROM PUBLIC por sí solo no basta en este proyecto.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Agenda: cancelación reversible, nunca borrado físico desde el asistente.
-- ---------------------------------------------------------------------------
ALTER TABLE agenda_tasks
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Los listados normales (día/semana/búsqueda) filtran cancelled_at IS NULL —
-- este índice cubre exactamente esa consulta más frecuente.
CREATE INDEX IF NOT EXISTS idx_agenda_tasks_workspace_cancelled
  ON agenda_tasks(workspace_id, cancelled_at);

-- ---------------------------------------------------------------------------
-- 2. Acciones pendientes de confirmación del Asistente de Ayuda.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assistant_pending_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Lista cerrada — CHECK, nunca texto libre. Añadir un valor nuevo exige
  -- una migración que también añada su CASE en resolve_assistant_pending_action().
  action_type    TEXT NOT NULL CHECK (action_type IN ('cancel_agenda_item')),
  -- Mínimo indispensable: IDs y parámetros, NUNCA documentos/guiones/contenido
  -- completo — decisión explícita del usuario para esta fase.
  payload        JSONB NOT NULL,
  -- Mismo texto exacto que se le mostró al usuario antes de confirmar —
  -- nunca se reconstruye después, para que auditoría y UI coincidan siempre.
  summary        TEXT NOT NULL,
  -- SHA-256 en hexadecimal (64 caracteres) del token de 32 bytes aleatorios
  -- generado en el servidor. El token en claro NUNCA se guarda aquí.
  token_hash     TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'executed', 'cancelled', 'expired', 'failed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  resolved_at    TIMESTAMPTZ,
  result         JSONB
);

CREATE INDEX IF NOT EXISTS idx_assistant_pending_actions_lookup
  ON assistant_pending_actions(token_hash, status);
CREATE INDEX IF NOT EXISTS idx_assistant_pending_actions_workspace
  ON assistant_pending_actions(workspace_id, actor_user_id, status);

-- Sin políticas RLS: ni anon ni authenticated tienen ninguna vía de acceso a
-- esta tabla, ni siquiera de lectura — todo pasa por resolve_assistant_pending_action()
-- (confirmar/cancelar) o por el cliente service_role (preparar), igual que
-- memberships/audit_log.
ALTER TABLE assistant_pending_actions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. resolve_assistant_pending_action — única vía para confirmar o cancelar.
--
-- Recibe el HASH (nunca el token en claro — lo calcula el llamador antes de
-- invocar esta función) y compara/busca siempre por hash.
--
-- Un token que no existe, o que existe pero no pertenece a este
-- workspace+actor, devuelve exactamente el mismo código ('invalid_token') —
-- nunca se revela si el token es de otra empresa o simplemente no existe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_assistant_pending_action(
  p_token_hash    TEXT,
  p_decision      TEXT, -- 'confirm' | 'cancel'
  p_actor_user_id UUID,
  p_workspace_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row            public.assistant_pending_actions%ROWTYPE;
  v_role           TEXT;
  v_package        TEXT;
  v_enabled        BOOLEAN;
  v_task           public.agenda_tasks%ROWTYPE;
  v_result         JSONB;
  v_agenda_task_id UUID;
BEGIN
  IF p_decision NOT IN ('confirm', 'cancel') THEN
    RAISE EXCEPTION 'invalid decision %', p_decision;
  END IF;
  IF p_token_hash IS NULL OR p_actor_user_id IS NULL OR p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'p_token_hash, p_actor_user_id and p_workspace_id are required';
  END IF;

  SELECT * INTO v_row
  FROM public.assistant_pending_actions
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_token');
  END IF;

  -- Mismo código que "no existe" — nunca confirmar ni desmentir que el
  -- token pertenece a otro workspace o a otro usuario. A partir de aquí,
  -- workspace/actor YA están verificados — cualquier rama posterior puede
  -- devolver con seguridad detalle adicional (final_status, pending_action_id).
  IF v_row.workspace_id <> p_workspace_id OR v_row.actor_user_id <> p_actor_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_token');
  END IF;

  IF v_row.status <> 'pending' THEN
    -- Ya resuelta — por este mismo intento antes, o por un reintento del
    -- MISMO actor/workspace tras perder la respuesta de red. Se devuelve
    -- el estado final REAL (final_status) para que el llamador pueda
    -- reconciliar un 'executed'/'cancelled' perdido como éxito, en vez de
    -- mostrar un error falso.
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'already_resolved',
      'final_status', v_row.status,
      'pending_action_id', v_row.id
    );
  END IF;

  IF v_row.expires_at <= now() THEN
    UPDATE public.assistant_pending_actions
    SET status = 'expired', resolved_at = now()
    WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'code', 'expired', 'pending_action_id', v_row.id);
  END IF;

  IF p_decision = 'cancel' THEN
    UPDATE public.assistant_pending_actions
    SET status = 'cancelled', resolved_at = now()
    WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', true, 'code', 'cancelled', 'pending_action_id', v_row.id);
  END IF;

  -- decision = 'confirm': re-validar TODO con datos frescos, dentro de esta
  -- misma transacción — nunca fiarse de que seguía siendo cierto cuando se
  -- preparó la acción, pudieron pasar hasta 5 minutos.
  SELECT role INTO v_role
  FROM public.memberships
  WHERE workspace_id = p_workspace_id
    AND user_id = p_actor_user_id
    AND is_active = true;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'manager', 'agent') THEN
    UPDATE public.assistant_pending_actions
    SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'permission_revoked')
    WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'code', 'permission_revoked', 'pending_action_id', v_row.id);
  END IF;

  SELECT product_package, help_assistant_actions_enabled
  INTO v_package, v_enabled
  FROM public.workspaces
  WHERE id = p_workspace_id;

  IF v_enabled IS NOT TRUE OR v_package NOT IN ('whatsapp_gestion', 'suite') THEN
    UPDATE public.assistant_pending_actions
    SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'permission_revoked')
    WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'code', 'permission_revoked', 'pending_action_id', v_row.id);
  END IF;

  -- Lista cerrada de acciones ejecutables — CASE explícito, nunca SQL
  -- dinámico ni un ejecutor genérico de payloads.
  IF v_row.action_type = 'cancel_agenda_item' THEN
    -- Revisión correctiva: el payload YA se validó con Zod en Node antes
    -- de insertar la fila, pero esta función es la última frontera
    -- transaccional — nunca confía ciegamente en el contenido de la
    -- columna. Exige EXACTAMENTE {"agenda_task_id": "<uuid>"} (objeto,
    -- una única clave, valor string con forma de UUID) antes de intentar
    -- el cast — un payload corrupto o manipulado falla controlado
    -- (status='failed') en vez de lanzar una excepción de casting o
    -- dejar la fila 'pending' para siempre.
    IF jsonb_typeof(v_row.payload) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_row.payload)) <> 1
       OR NOT (v_row.payload ? 'agenda_task_id')
       OR jsonb_typeof(v_row.payload -> 'agenda_task_id') <> 'string'
       OR (v_row.payload ->> 'agenda_task_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'invalid_payload')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'internal_error', 'pending_action_id', v_row.id);
    END IF;

    v_agenda_task_id := (v_row.payload ->> 'agenda_task_id')::uuid;

    SELECT * INTO v_task
    FROM public.agenda_tasks
    WHERE id = v_agenda_task_id
      AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF v_task IS NULL THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'entity_not_found')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'entity_not_found', 'pending_action_id', v_row.id);
    END IF;

    IF v_task.cancelled_at IS NOT NULL THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'entity_already_changed')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'entity_already_changed', 'pending_action_id', v_row.id);
    END IF;

    UPDATE public.agenda_tasks
    SET cancelled_at = now(), cancelled_by = p_actor_user_id, updated_at = now()
    WHERE id = v_task.id;

    v_result := jsonb_build_object('agenda_task_id', v_task.id);
  ELSE
    -- No debería ser alcanzable — el CHECK de action_type ya cierra los
    -- valores posibles — pero si algún día se añade un valor al CHECK sin
    -- añadir su CASE aquí, esto falla explícito en vez de ejecutar nada.
    UPDATE public.assistant_pending_actions
    SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'unknown_action_type')
    WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'code', 'internal_error', 'pending_action_id', v_row.id);
  END IF;

  UPDATE public.assistant_pending_actions
  SET status = 'executed', resolved_at = now(), result = v_result
  WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'code', 'executed', 'result', v_result, 'pending_action_id', v_row.id);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_assistant_pending_action(TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_assistant_pending_action(TEXT, TEXT, UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. reserve_help_assistant_confirm_attempt — límite de intentos de
-- confirmación, defensa en profundidad contra enumeración (el token en sí
-- es inadivinable: 256 bits aleatorios). Mismo patrón EXACTO que
-- reserve_content_script_generation() (20260808000008): cuenta Y reserva
-- en una única llamada atómica de Postgres con un advisory lock
-- transaccional por (workspace_id, user_id) — nunca "SELECT count desde
-- Node -> INSERT desde Node" (TOCTOU: dos peticiones concurrentes leerían
-- el mismo count antes de que ninguna insertara, y ambas pasarían el
-- límite). Si esta reserva falla (error de conexión, etc.), el llamador
-- debe tratarlo como fail-closed (503), nunca proceder a resolver el
-- token igualmente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_help_assistant_confirm_attempt(
  p_workspace_id   UUID,
  p_user_id        UUID,
  p_window_seconds INT DEFAULT 300,
  p_max_per_window INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lock_key BIGINT;
  v_since    TIMESTAMPTZ;
  v_count    INT;
BEGIN
  IF p_workspace_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and user_id are required';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'invalid p_window_seconds %', p_window_seconds;
  END IF;
  IF p_max_per_window IS NULL OR p_max_per_window <= 0 THEN
    RAISE EXCEPTION 'invalid p_max_per_window %', p_max_per_window;
  END IF;

  v_lock_key := hashtextextended(p_workspace_id::text || ':' || p_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_since := now() - (p_window_seconds || ' seconds')::interval;

  SELECT count(*) INTO v_count
  FROM public.events
  WHERE type = 'help_assistant_confirm_attempt'
    AND workspace_id = p_workspace_id
    AND (payload ->> 'user_id') = p_user_id::text
    AND created_at >= v_since;

  IF v_count >= p_max_per_window THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_count, 'limit', p_max_per_window);
  END IF;

  -- Cuenta cada INTENTO (autorizado a proceder), no solo los que terminan
  -- en éxito — se reserva antes de resolver el token, mismo principio que
  -- reserve_content_script_generation(). Nunca se guarda IP ni ningún otro
  -- dato personal aquí — workspace_id + user_id son el control principal.
  INSERT INTO public.events (type, level, workspace_id, conversation_id, payload)
  VALUES (
    'help_assistant_confirm_attempt',
    'info',
    p_workspace_id,
    NULL,
    jsonb_build_object('user_id', p_user_id)
  );

  RETURN jsonb_build_object('allowed', true, 'used', v_count + 1, 'limit', p_max_per_window);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_help_assistant_confirm_attempt(UUID, UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_help_assistant_confirm_attempt(UUID, UUID, INT, INT) TO service_role;

-- ============================================================
-- End of migration: 20260809000000_assistant_confirmable_actions
-- ============================================================
