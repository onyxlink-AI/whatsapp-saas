-- ============================================================
-- Migration: 20260811000000_content_items_agent_write
-- Fase 4 (Asistente de Ayuda — Agente de Contenido conectado con Guiones):
--
-- 1. `content_items` no tenía ningún token de concurrencia — dos escrituras
--    concurrentes (un humano editando en /contenido y el asistente
--    aplicando una actualización) se pisaban en silencio, la última en
--    llegar ganaba sin aviso. Se añade `version` + un trigger que la sube
--    en CUALQUIER UPDATE (humano o asistente, por igual) para que sea un
--    token de concurrencia real sin tener que tocar el camino de escritura
--    humano existente (`content-actions.ts:updateContentItem`).
-- 2. `update_content_item_fields_cas` — único camino de escritura
--    workspace-scoped con comparar-y-cambiar real (mismo patrón que
--    `update_whiteboard_scene_cas`): valida el parche contra una lista
--    cerrada de columnas permitidas (nunca inyecta un nombre de columna
--    arbitrario), comprueba que `responsible_id` (si viene) pertenece al
--    mismo workspace, y solo escribe si `version` coincide.
-- 3. `update_content_item` se une a la lista cerrada de acciones
--    confirmables de 4B/4C (assistant_pending_actions) — para cuando el
--    agente va a SUSTITUIR un campo que ya tenía contenido, reutilizando
--    exactamente la misma función CAS desde dentro de
--    resolve_assistant_pending_action.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. version + trigger de incremento automático
-- ---------------------------------------------------------------------------
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_content_item_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Sube SIEMPRE en cualquier UPDATE real — humano o asistente, por el
  -- mismo camino. El propio valor que el llamador mande en `version` se
  -- ignora a propósito: nunca puede fijarlo a mano, solo el trigger decide.
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_items_bump_version ON content_items;
CREATE TRIGGER content_items_bump_version
  BEFORE UPDATE ON content_items
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_content_item_version();

-- ---------------------------------------------------------------------------
-- 2. update_content_item_fields_cas — SECURITY INVOKER (RLS real del
-- llamador), workspace e id explícitos, lista cerrada de columnas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_content_item_fields_cas(
  p_workspace_id     UUID,
  p_content_item_id  UUID,
  p_expected_version INT,
  p_patch            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_allowed        TEXT[] := ARRAY[
    'title', 'main_idea', 'description', 'content_type', 'platform', 'orientation',
    'responsible_id', 'scheduled_date', 'script_hook', 'script_body', 'script_closing',
    'script_cta', 'bullet_points', 'reference_links', 'notes', 'lighting_notes',
    'music_notes', 'duration_estimate'
  ];
  v_jsonb_columns  TEXT[] := ARRAY['bullet_points', 'reference_links'];
  v_key            TEXT;
  v_set_clauses    TEXT[] := ARRAY[]::TEXT[];
  v_sql            TEXT;
  v_new_version    INT;
  v_exists         BOOLEAN;
  v_responsible_id UUID;
BEGIN
  IF p_workspace_id IS NULL OR p_content_item_id IS NULL OR p_expected_version IS NULL OR p_patch IS NULL THEN
    RAISE EXCEPTION 'p_workspace_id, p_content_item_id, p_expected_version and p_patch are required';
  END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch must be a JSON object';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_patch)) = 0 THEN
    RAISE EXCEPTION 'p_patch must not be empty';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'campo no permitido en el parche: %', v_key;
    END IF;
  END LOOP;

  -- responsible_id, si viene y no es null, DEBE pertenecer al mismo
  -- workspace — nunca se confía en un id que el modelo haya propuesto sin
  -- verificarlo (defensa en profundidad, además de la comprobación en Node).
  IF p_patch ? 'responsible_id' AND jsonb_typeof(p_patch -> 'responsible_id') = 'string' THEN
    v_responsible_id := (p_patch ->> 'responsible_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.memberships
      WHERE workspace_id = p_workspace_id AND user_id = v_responsible_id AND is_active = true
    ) THEN
      RETURN jsonb_build_object('result', 'invalid_responsible');
    END IF;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF v_key = ANY(v_jsonb_columns) THEN
      v_set_clauses := v_set_clauses || format('%I = %L::jsonb', v_key, p_patch -> v_key);
    ELSIF v_key = 'orientation' THEN
      v_set_clauses := v_set_clauses || format('%I = %L::content_orientation', v_key, p_patch ->> v_key);
    ELSIF v_key = 'responsible_id' THEN
      v_set_clauses := v_set_clauses || format('%I = %L::uuid', v_key, p_patch ->> v_key);
    ELSIF v_key = 'scheduled_date' THEN
      v_set_clauses := v_set_clauses || format('%I = %L::date', v_key, p_patch ->> v_key);
    ELSE
      v_set_clauses := v_set_clauses || format('%I = %L', v_key, p_patch ->> v_key);
    END IF;
  END LOOP;

  -- Los nombres de columna vienen EXCLUSIVAMENTE de v_allowed (ya validado
  -- arriba) y se citan con %I — nunca se concatena nada del payload como
  -- identificador sin pasar por ese whitelist primero.
  v_sql := format(
    'UPDATE public.content_items SET %s WHERE id = %L AND workspace_id = %L AND version = %L RETURNING version',
    array_to_string(v_set_clauses, ', '),
    p_content_item_id,
    p_workspace_id,
    p_expected_version
  );
  EXECUTE v_sql INTO v_new_version;

  IF v_new_version IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'updated', 'version', v_new_version);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.content_items WHERE id = p_content_item_id AND workspace_id = p_workspace_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('result', 'not_found_or_forbidden');
  END IF;
  RETURN jsonb_build_object('result', 'conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.update_content_item_fields_cas(UUID, UUID, INT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_content_item_fields_cas(UUID, UUID, INT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. update_content_item se une a la lista cerrada de acciones confirmables.
-- ---------------------------------------------------------------------------
ALTER TABLE assistant_pending_actions DROP CONSTRAINT IF EXISTS assistant_pending_actions_action_type_check;
ALTER TABLE assistant_pending_actions
  ADD CONSTRAINT assistant_pending_actions_action_type_check
  CHECK (action_type IN ('cancel_agenda_item', 'delete_board_element', 'update_content_item'));

-- ---------------------------------------------------------------------------
-- 4. resolve_assistant_pending_action — añade la rama 'update_content_item',
-- reutilizando la MISMA update_content_item_fields_cas que usa el camino
-- directo (nunca duplica la lógica de escritura).
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
  -- update_content_item
  v_content_item_id          UUID;
  v_expected_content_version INT;
  v_content_patch            JSONB;
  v_cas_result                JSONB;
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

  ELSIF v_row.action_type = 'update_content_item' THEN
    -- Payload esperado EXACTO: {content_item_id: uuid, expected_version: number, patch: object no vacío}.
    IF jsonb_typeof(v_row.payload) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_row.payload)) <> 3
       OR NOT (v_row.payload ? 'content_item_id')
       OR NOT (v_row.payload ? 'expected_version')
       OR NOT (v_row.payload ? 'patch')
       OR jsonb_typeof(v_row.payload -> 'content_item_id') <> 'string'
       OR (v_row.payload ->> 'content_item_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_row.payload -> 'expected_version') <> 'number'
       OR jsonb_typeof(v_row.payload -> 'patch') <> 'object'
    THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'invalid_payload')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'internal_error', 'pending_action_id', v_row.id);
    END IF;

    v_content_item_id := (v_row.payload ->> 'content_item_id')::uuid;
    v_expected_content_version := (v_row.payload ->> 'expected_version')::int;
    v_content_patch := v_row.payload -> 'patch';

    BEGIN
      v_cas_result := public.update_content_item_fields_cas(p_workspace_id, v_content_item_id, v_expected_content_version, v_content_patch);
    EXCEPTION WHEN OTHERS THEN
      -- Un campo no permitido en el parche (o cualquier otro fallo de la
      -- función CAS) nunca debe tumbar esta transacción sin dejar rastro.
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'invalid_payload')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'internal_error', 'pending_action_id', v_row.id);
    END;

    IF v_cas_result ->> 'result' = 'not_found_or_forbidden' THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'entity_not_found')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'entity_not_found', 'pending_action_id', v_row.id);
    ELSIF v_cas_result ->> 'result' = 'conflict' THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'entity_already_changed')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'entity_already_changed', 'pending_action_id', v_row.id);
    ELSIF v_cas_result ->> 'result' = 'invalid_responsible' THEN
      UPDATE public.assistant_pending_actions
      SET status = 'failed', resolved_at = now(), result = jsonb_build_object('code', 'invalid_payload')
      WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'code', 'internal_error', 'pending_action_id', v_row.id);
    END IF;

    v_result := jsonb_build_object('content_item_id', v_content_item_id, 'version', (v_cas_result ->> 'version')::int);

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
-- End of migration: 20260811000000_content_items_agent_write
-- ============================================================
