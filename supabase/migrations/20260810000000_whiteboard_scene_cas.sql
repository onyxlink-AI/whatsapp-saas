-- ============================================================
-- Migration: 20260810000000_whiteboard_scene_cas
-- Fase 4C del roadmap comercial: edición interna de Board por el
-- Asistente de Ayuda.
--
-- Decisiones cerradas por el usuario:
--   - whiteboards.version (bigint) — control de concurrencia optimista a
--     nivel de tablero, SOLO para `elements`. Arranca en 1 para todo
--     tablero existente (aditivo, sin backfill de contenido).
--   - update_whiteboard_scene_cas()/update_whiteboard_app_state(): ambas
--     SECURITY INVOKER (NO DEFINER) — tanto el editor como las tools del
--     asistente llaman con el cliente de SESIÓN (RLS activa), nunca con
--     service_role.
--   - Revisión correctiva de esta misma fase (antes de cualquier commit):
--     * update_whiteboard_scene_cas() deja de recibir/escribir el
--       `scene_data` completo — SOLO recibe `p_elements` y hace
--       `jsonb_set(scene_data, '{elements}', p_elements)`, nunca toca la
--       clave `appState`. Así, una escritura de elementos del asistente
--       nunca puede pisar con una copia vieja el zoom/scroll que el
--       usuario acaba de cambiar en su navegador.
--     * update_whiteboard_app_state() (nueva) hace exactamente lo
--       simétrico: `jsonb_set(scene_data, '{appState}', p_app_state)`,
--       nunca toca `elements`, nunca incrementa `version` (el viewport no
--       es contenido — no debe poder generar un conflicto de edición ni
--       gastar un número de versión). Sin expected_version: dos cambios
--       de cámara nunca "chocan" de forma que importe, last-write-wins es
--       correcto aquí.
--     * delete_board_element ya no null-ea bindings para "desconectar" —
--       eso perdía la relación original y restore_board_element no podía
--       reconstruirla. Ahora genera un `deletionGroupId` por operación,
--       marca `isDeleted=true` en el objetivo Y en sus dependientes
--       (texto ligado si el objetivo es un contenedor; flechas conectadas
--       al objetivo) SIN tocar ningún binding — se conservan tal cual
--       estaban. Cada elemento marcado por ESTA operación lleva
--       `customData.onyxlinkDeletionGroup = <deletionGroupId>` (fusionado
--       con cualquier customData previo, nunca lo pisa). Un elemento que
--       YA estaba borrado antes de esta operación nunca se re-marca ni se
--       incluye en el grupo. restore_board_element (Node, en
--       board-tools.ts) localiza todos los elementos con el MISMO
--       deletionGroupId que el objetivo pedido, los restaura juntos y
--       limpia esa clave de customData (conservando el resto) — así una
--       nota contenedora + su texto + las flechas que se retiraron con
--       ella vuelven completas, con sus bindings intactos porque nunca se
--       tocaron.
--
-- REVOKE explícito de anon (y PUBLIC) desde el primer commit. authenticated
-- SÍ necesita EXECUTE en las dos funciones de escritura de scene_data
-- (a diferencia de 4A/4B) porque las llama el propio cliente de sesión del
-- usuario, no service_role.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. whiteboards.version — control de concurrencia optimista, solo elements.
-- ---------------------------------------------------------------------------
ALTER TABLE whiteboards ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- 2. update_whiteboard_scene_cas — única vía de escritura de scene_data.elements.
-- Recibe SOLO el array de elementos — nunca el blob completo — para no
-- poder pisar accidentalmente un appState más fresco que el que el
-- llamador tenía cuando leyó el tablero.
--
-- Devuelve SIEMPRE {result: 'updated'|'conflict'|'not_found_or_forbidden'|'scene_too_large', ...}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_whiteboard_scene_cas(
  p_workspace_id     UUID,
  p_whiteboard_id    UUID,
  p_expected_version BIGINT,
  p_elements         JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_element_count INT;
  v_size_bytes    INT;
  v_new_version   BIGINT;
  v_exists        BOOLEAN;
BEGIN
  IF p_workspace_id IS NULL OR p_whiteboard_id IS NULL OR p_expected_version IS NULL OR p_elements IS NULL THEN
    RAISE EXCEPTION 'p_workspace_id, p_whiteboard_id, p_expected_version and p_elements are required';
  END IF;
  IF jsonb_typeof(p_elements) <> 'array' THEN
    RAISE EXCEPTION 'p_elements must be a JSON array';
  END IF;

  v_element_count := jsonb_array_length(p_elements);
  v_size_bytes := octet_length(p_elements::text);

  IF v_element_count > 1000 OR v_size_bytes > 5 * 1024 * 1024 THEN
    RETURN jsonb_build_object(
      'result', 'scene_too_large',
      'element_count', v_element_count,
      'size_bytes', v_size_bytes
    );
  END IF;

  -- jsonb_set sobre la COLUMNA (no sobre una copia local) — lee el
  -- appState VIGENTE en ese instante y lo conserva intacto, sea cual sea
  -- (incluso si cambió después de que este llamador leyera el tablero).
  -- Filtro EXPLÍCITO de workspace_id — nunca fiarse solo de RLS.
  UPDATE public.whiteboards
  SET scene_data = jsonb_set(scene_data, '{elements}', p_elements),
      version = version + 1,
      updated_at = now()
  WHERE id = p_whiteboard_id AND workspace_id = p_workspace_id AND version = p_expected_version
  RETURNING version INTO v_new_version;

  IF FOUND THEN
    RETURN jsonb_build_object('result', 'updated', 'version', v_new_version);
  END IF;

  -- 0 filas: "no existe/sin permiso" (RLS) o "conflicto de versión" — se
  -- distinguen con una lectura adicional, también sujeta a RLS.
  SELECT EXISTS(
    SELECT 1 FROM public.whiteboards WHERE id = p_whiteboard_id AND workspace_id = p_workspace_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN jsonb_build_object('result', 'not_found_or_forbidden');
  END IF;

  RETURN jsonb_build_object('result', 'conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.update_whiteboard_scene_cas(UUID, UUID, BIGINT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_whiteboard_scene_cas(UUID, UUID, BIGINT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2b. update_whiteboard_app_state — única vía de escritura de
-- scene_data.appState. Nunca toca `elements`, nunca incrementa `version`
-- (el viewport no es contenido de la escena) — el editor la usa para
-- persistir zoom/scroll/colores activos sin arriesgar un conflicto de
-- edición ni gastar versión. Sin expected_version: no hace falta, dos
-- cambios de cámara nunca necesitan resolverse con más cuidado que
-- "gana el último".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_whiteboard_app_state(
  p_workspace_id  UUID,
  p_whiteboard_id UUID,
  p_app_state     JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_key   TEXT;
  v_found BOOLEAN;
BEGIN
  IF p_workspace_id IS NULL OR p_whiteboard_id IS NULL OR p_app_state IS NULL THEN
    RAISE EXCEPTION 'p_workspace_id, p_whiteboard_id and p_app_state are required';
  END IF;
  IF jsonb_typeof(p_app_state) <> 'object' THEN
    RAISE EXCEPTION 'p_app_state must be a JSON object';
  END IF;
  IF octet_length(p_app_state::text) > 10 * 1024 THEN
    RETURN jsonb_build_object('result', 'scene_too_large');
  END IF;

  -- Lista cerrada de claves permitidas — la MISMA que
  -- pickPersistableAppState() en whiteboard-editor.tsx. Cualquier clave
  -- fuera de esta lista hace fallar la llamada entera (nunca se acepta
  -- appState parcial "menos la clave rara" en silencio).
  FOR v_key IN SELECT jsonb_object_keys(p_app_state) LOOP
    IF v_key NOT IN ('viewBackgroundColor', 'currentItemStrokeColor', 'currentItemBackgroundColor', 'zoom', 'scrollX', 'scrollY', 'gridSize') THEN
      RAISE EXCEPTION 'appState key not allowed: %', v_key;
    END IF;
  END LOOP;

  UPDATE public.whiteboards
  SET scene_data = jsonb_set(scene_data, '{appState}', p_app_state),
      updated_at = now()
  WHERE id = p_whiteboard_id AND workspace_id = p_workspace_id;

  v_found := FOUND;

  IF NOT v_found THEN
    RETURN jsonb_build_object('result', 'not_found_or_forbidden');
  END IF;

  RETURN jsonb_build_object('result', 'updated');
END;
$$;

REVOKE ALL ON FUNCTION public.update_whiteboard_app_state(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_whiteboard_app_state(UUID, UUID, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. delete_board_element se une a la lista cerrada de acciones
-- confirmables de 4B — misma tabla, mismo flujo, sin infraestructura nueva.
-- ---------------------------------------------------------------------------
ALTER TABLE assistant_pending_actions DROP CONSTRAINT IF EXISTS assistant_pending_actions_action_type_check;
ALTER TABLE assistant_pending_actions
  ADD CONSTRAINT assistant_pending_actions_action_type_check
  CHECK (action_type IN ('cancel_agenda_item', 'delete_board_element'));

-- ---------------------------------------------------------------------------
-- 4. resolve_assistant_pending_action — CREATE OR REPLACE con el CASE de
-- 'delete_board_element' reescrito (revisión correctiva): borrado por
-- GRUPO reversible, nunca toca bindings.
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
  v_row                      public.assistant_pending_actions%ROWTYPE;
  v_role                     TEXT;
  v_package                  TEXT;
  v_enabled                  BOOLEAN;
  v_task                     public.agenda_tasks%ROWTYPE;
  v_result                   JSONB;
  v_agenda_task_id           UUID;
  -- delete_board_element
  v_whiteboard_id            UUID;
  v_element_id               TEXT;
  v_expected_element_version BIGINT;
  v_board                    public.whiteboards%ROWTYPE;
  v_target                   JSONB;
  v_target_type              TEXT;
  v_elements                 JSONB;
  v_new_elements             JSONB;
  v_elem                     JSONB;
  v_elem_id                  TEXT;
  v_patched                  JSONB;
  v_now_ms                   BIGINT;
  v_deletion_group           UUID;
  v_dependent_ids            TEXT[];
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

  IF v_row.workspace_id <> p_workspace_id OR v_row.actor_user_id <> p_actor_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_token');
  END IF;

  IF v_row.status <> 'pending' THEN
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

  ELSIF v_row.action_type = 'delete_board_element' THEN
    -- Payload esperado EXACTO: {whiteboard_id: uuid, element_id: string, expected_element_version: number}.
    IF jsonb_typeof(v_row.payload) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_row.payload)) <> 3
       OR NOT (v_row.payload ? 'whiteboard_id')
       OR NOT (v_row.payload ? 'element_id')
       OR NOT (v_row.payload ? 'expected_element_version')
       OR jsonb_typeof(v_row.payload -> 'whiteboard_id') <> 'string'
       OR (v_row.payload ->> 'whiteboard_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_row.payload -> 'element_id') <> 'string'
       OR length(v_row.payload ->> 'element_id') < 1
       OR length(v_row.payload ->> 'element_id') > 100
       OR jsonb_typeof(v_row.payload -> 'expected_element_version') <> 'number'
    THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'invalid_payload')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'internal_error', 'pending_action_id', v_row.id);
    END IF;

    v_whiteboard_id := (v_row.payload ->> 'whiteboard_id')::uuid;
    v_element_id := v_row.payload ->> 'element_id';
    v_expected_element_version := (v_row.payload ->> 'expected_element_version')::bigint;

    SELECT * INTO v_board
    FROM public.whiteboards
    WHERE id = v_whiteboard_id AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF v_board IS NULL THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'entity_not_found')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'entity_not_found', 'pending_action_id', v_row.id);
    END IF;

    v_elements := v_board.scene_data -> 'elements';

    SELECT elem INTO v_target
    FROM jsonb_array_elements(v_elements) elem
    WHERE elem ->> 'id' = v_element_id;

    IF v_target IS NULL THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'entity_not_found')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'entity_not_found', 'pending_action_id', v_row.id);
    END IF;

    IF COALESCE((v_target ->> 'isDeleted')::boolean, false)
       OR (v_target ->> 'version')::bigint <> v_expected_element_version
    THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'entity_already_changed')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'entity_already_changed', 'pending_action_id', v_row.id);
    END IF;

    v_target_type := v_target ->> 'type';
    v_deletion_group := gen_random_uuid();
    v_now_ms := floor(extract(epoch FROM now()) * 1000);

    -- Dependientes que desaparecen CON el objetivo, en el mismo grupo de
    -- borrado — nunca se tocan sus bindings, solo se marcan isDeleted.
    --   - contenedor -> su texto ligado (containerId = objetivo) Y
    --     cualquier flecha con un extremo en el objetivo.
    --   - flecha o texto -> sin dependientes propios.
    IF v_target_type IN ('rectangle', 'ellipse', 'diamond') THEN
      SELECT COALESCE(array_agg(elem ->> 'id'), ARRAY[]::text[]) INTO v_dependent_ids
      FROM jsonb_array_elements(v_elements) elem
      WHERE NOT COALESCE((elem ->> 'isDeleted')::boolean, false)
        AND elem ->> 'id' <> v_element_id
        AND (
          (elem ->> 'containerId') = v_element_id
          OR (elem ->> 'type' = 'arrow' AND (
                (elem -> 'startBinding' ->> 'elementId') = v_element_id
                OR (elem -> 'endBinding' ->> 'elementId') = v_element_id
              ))
        );
    ELSE
      v_dependent_ids := ARRAY[]::text[];
    END IF;

    v_new_elements := '[]'::jsonb;
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_elements)
    LOOP
      v_elem_id := v_elem ->> 'id';
      IF v_elem_id = v_element_id OR v_elem_id = ANY(v_dependent_ids) THEN
        v_patched := v_elem || jsonb_build_object(
          'isDeleted', true,
          'version', (v_elem ->> 'version')::bigint + 1,
          'versionNonce', floor(random() * 2000000000)::bigint,
          'updated', v_now_ms,
          'customData', COALESCE(v_elem -> 'customData', '{}'::jsonb) || jsonb_build_object('onyxlinkDeletionGroup', v_deletion_group::text)
        );
      ELSE
        v_patched := v_elem;
      END IF;
      v_new_elements := v_new_elements || jsonb_build_array(v_patched);
    END LOOP;

    UPDATE public.whiteboards
    SET scene_data = jsonb_set(v_board.scene_data, '{elements}', v_new_elements),
        version = v_board.version + 1,
        updated_at = now()
    WHERE id = v_board.id;

    v_result := jsonb_build_object('whiteboard_id', v_whiteboard_id, 'element_id', v_element_id, 'deletion_group_id', v_deletion_group);

  ELSE
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

-- ============================================================
-- End of migration: 20260810000000_whiteboard_scene_cas
-- ============================================================
