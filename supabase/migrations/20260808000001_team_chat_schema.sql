-- ============================================================
-- Migration: 20260808000001_team_chat_schema
-- Fase B del Chat de equipo (docs/ONYXLINK-ARQUITECTURA-CHAT-BIBLIOTECA-SEGURIDAD.md):
-- team_channels, team_channel_members, team_messages, aislamiento cruzado
-- por trigger, RLS con JWT real y autorización de Realtime Broadcast
-- privado. Deliberadamente NO reutiliza `messages`/`conversations` de
-- WhatsApp — otra semántica, otro dueño, otro ciclo de vida.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE team_channel_kind AS ENUM ('general', 'direct');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- team_channels
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'General',
  kind         team_channel_kind NOT NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Clave canónica del DM: LEAST(user_a,user_b) || ':' || GREATEST(user_a,user_b),
  -- calculada siempre en get_or_create_dm_channel(), nunca por el cliente.
  direct_key   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT chk_team_channels_direct_key CHECK (
    (kind = 'direct' AND direct_key IS NOT NULL) OR
    (kind = 'general' AND direct_key IS NULL)
  )
);

-- Un único General por workspace; un único canal por pareja de usuarios.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_channels_general
  ON team_channels(workspace_id) WHERE kind = 'general';
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_channels_direct
  ON team_channels(workspace_id, direct_key) WHERE kind = 'direct';

DROP TRIGGER IF EXISTS trg_team_channels_updated_at ON team_channels;
CREATE TRIGGER trg_team_channels_updated_at
  BEFORE UPDATE ON team_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- team_channel_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_channel_members (
  channel_id   UUID NOT NULL REFERENCES team_channels(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_read_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_channel_members_user ON team_channel_members(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_team_channel_members_workspace ON team_channel_members(workspace_id);

-- Cierra el hueco de relación cruzada que una FK simple no puede: que el
-- `workspace_id` de la fila coincida con el del canal, y que el usuario sea
-- de verdad miembro ACTIVO de ese workspace — mismo patrón que
-- validate_content_item_workspace_relations() en 20260807000000.
CREATE OR REPLACE FUNCTION public.validate_team_channel_member_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_channel_workspace UUID;
BEGIN
  SELECT workspace_id INTO v_channel_workspace
  FROM public.team_channels WHERE id = NEW.channel_id;

  IF v_channel_workspace IS NULL OR v_channel_workspace <> NEW.workspace_id THEN
    RAISE EXCEPTION 'team_channel_members.workspace_id must match the channel''s workspace';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'team_channel_members.user_id must be an active member of the workspace';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_channel_members_workspace ON team_channel_members;
CREATE TRIGGER trg_team_channel_members_workspace
  BEFORE INSERT OR UPDATE OF channel_id, workspace_id, user_id
  ON team_channel_members
  FOR EACH ROW EXECUTE FUNCTION public.validate_team_channel_member_workspace();

-- ---------------------------------------------------------------------------
-- team_messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id   UUID NOT NULL REFERENCES team_channels(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  edited_at    TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ
);

-- Paginación por cursor: (channel_id, created_at desc, id desc).
CREATE INDEX IF NOT EXISTS idx_team_messages_channel_cursor
  ON team_messages(channel_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.validate_team_message_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_channel_workspace UUID;
BEGIN
  SELECT workspace_id INTO v_channel_workspace
  FROM public.team_channels WHERE id = NEW.channel_id;

  IF v_channel_workspace IS NULL OR v_channel_workspace <> NEW.workspace_id THEN
    RAISE EXCEPTION 'team_messages.workspace_id must match the channel''s workspace';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_channel_members
    WHERE channel_id = NEW.channel_id AND user_id = NEW.sender_id
  ) THEN
    RAISE EXCEPTION 'team_messages.sender_id must be a participant of the channel';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = NEW.workspace_id AND team_chat_enabled = TRUE
  ) THEN
    RAISE EXCEPTION 'team chat is not enabled for this workspace';
  END IF;

  RETURN NEW;
END;
$$;

-- Solo BEFORE INSERT — editar/borrar-lógico un mensaje existente nunca
-- cambia canal/workspace/remitente, así que no hace falta re-validar eso.
DROP TRIGGER IF EXISTS trg_team_messages_workspace ON team_messages;
CREATE TRIGGER trg_team_messages_workspace
  BEFORE INSERT ON team_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_team_message_workspace();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE team_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_messages ENABLE ROW LEVEL SECURITY;

-- Igual que auth_workspace_ids()/auth_has_role() (20260608000000_foundation.sql):
-- una policy de team_channel_members no puede consultar la propia
-- team_channel_members dentro de su USING — Postgres detecta la
-- autorreferencia y falla con "infinite recursion detected in policy for
-- relation team_channel_members" (confirmado con un INSERT real bajo un JWT
-- de usuario en las pruebas de aislamiento). SECURITY DEFINER hace bypass de
-- RLS en la función, rompiendo el ciclo — mismo patrón que el resto del
-- proyecto, no una excepción nueva.
-- Revisión de arquitectura (docs/CLAUDE-REVISION-CHAT-FASE-1.md, bloqueo 1):
-- la versión original solo miraba team_channel_members, así que un miembro
-- desactivado (offboarding) o un workspace con el Chat apagado seguían
-- autorizados — tanto en las policies de arriba como, más grave, en la
-- policy de recepción de Realtime Broadcast (más abajo), que sigue
-- autorizando la suscripción mientras haya una fila en team_channel_members,
-- sin volver a comprobar nada en cada evento. Ahora exige explícitamente
-- membership ACTIVA del mismo workspace y team_chat_enabled=true — cortar el
-- acceso (desactivar a alguien, o apagar el Chat) tiene efecto inmediato en
-- todo lo que dependa de esta función, incluida la autorización de Realtime.
CREATE OR REPLACE FUNCTION public.auth_team_channel_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT tcm.channel_id
  FROM public.team_channel_members tcm
  JOIN public.memberships m
    ON m.workspace_id = tcm.workspace_id AND m.user_id = tcm.user_id AND m.is_active = TRUE
  JOIN public.workspaces w
    ON w.id = tcm.workspace_id AND w.team_chat_enabled = TRUE
  WHERE tcm.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.auth_team_channel_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_channel_ids() TO authenticated;

-- team_channels: solo lectura, y solo de canales donde el usuario participa
-- de verdad (no basta con ser miembro del workspace — un DM ajeno dentro
-- del mismo workspace debe seguir siendo invisible). Nunca acepta el
-- workspace_id del cliente como prueba de autoridad por sí solo: la
-- pertenencia real se valida vía auth_workspace_ids() (deriva de
-- memberships con auth.uid()) Y la participación se valida vía
-- auth_team_channel_ids() (deriva de team_channel_members con auth.uid()),
-- no con un id que llegue del payload.
CREATE POLICY "team_channels_select_participant"
  ON team_channels FOR SELECT
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND id IN (SELECT auth_team_channel_ids())
  );

-- Ninguna escritura de cliente sobre team_channels: crear canales es
-- exclusivo de set_team_chat_enabled()/get_or_create_dm_channel() (SECURITY
-- DEFINER, dueño de la tabla, hace bypass de RLS).
REVOKE INSERT, UPDATE, DELETE ON team_channels FROM anon, authenticated;

-- team_channel_members: ver solo las filas de canales donde el propio
-- usuario también participa (así puede ver "quién más está en este DM/
-- General" sin poder enumerar la membresía de canales ajenos).
CREATE POLICY "team_channel_members_select_participant"
  ON team_channel_members FOR SELECT
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND channel_id IN (SELECT auth_team_channel_ids())
  );

-- Solo puede tocar su propia fila, y solo para marcar como leído — el
-- GRANT de columna de abajo es lo que de verdad impide reescribir
-- channel_id/workspace_id/user_id para "saltar" a otro canal vía UPDATE
-- (row-level RLS por sí sola no distingue qué columnas cambian).
CREATE POLICY "team_channel_members_update_own_last_read"
  ON team_channel_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE INSERT, DELETE ON team_channel_members FROM anon, authenticated;
REVOKE UPDATE ON team_channel_members FROM anon, authenticated;
GRANT UPDATE (last_read_at) ON team_channel_members TO authenticated;

-- team_messages: leer solo si participa en el canal.
CREATE POLICY "team_messages_select_participant"
  ON team_messages FOR SELECT
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND channel_id IN (SELECT auth_team_channel_ids())
  );

-- Insertar: sender_id = auth.uid() (nunca confiar en un sender_id ajeno del
-- payload), participante activo del canal y Chat habilitado en el
-- workspace — las tres condiciones que exige la arquitectura sección 5. El
-- trigger de arriba las vuelve a exigir a nivel de fila por si algún día
-- algo escribe sin pasar por esta policy (defensa en profundidad, no
-- redundancia inútil).
CREATE POLICY "team_messages_insert_participant"
  ON team_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND workspace_id IN (SELECT auth_workspace_ids())
    AND channel_id IN (SELECT auth_team_channel_ids())
    AND EXISTS (
      SELECT 1 FROM workspaces w WHERE w.id = team_messages.workspace_id AND w.team_chat_enabled = TRUE
    )
  );

-- Editar/borrado lógico: solo el autor, y solo body/edited_at/deleted_at
-- (columna-restringido más abajo) — nunca DELETE físico desde cliente.
CREATE POLICY "team_messages_update_own"
  ON team_messages FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

REVOKE DELETE ON team_messages FROM anon, authenticated;
REVOKE UPDATE ON team_messages FROM anon, authenticated;
GRANT UPDATE (body, edited_at, deleted_at) ON team_messages TO authenticated;

-- ---------------------------------------------------------------------------
-- claim_workspace_seat — redefinición: además de reservar la plaza, da de
-- alta automáticamente en General si el Chat ya está activo (ver comentario
-- en 20260808000000_team_chat_entitlements.sql — ahí no existían todavía
-- estas tablas).
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

  INSERT INTO public.team_channel_members (channel_id, workspace_id, user_id, joined_at, last_read_at)
  SELECT tc.id, p_workspace_id, p_user_id, now(), now()
  FROM public.team_channels tc
  WHERE tc.workspace_id = p_workspace_id AND tc.kind = 'general'
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_workspace_seat(UUID, UUID, public.workspace_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_workspace_seat(UUID, UUID, public.workspace_role) TO service_role;

-- ---------------------------------------------------------------------------
-- set_team_chat_enabled — revisión de arquitectura (bloqueo 3): la ruta API
-- original hacía dos pasos sueltos — UPDATE workspaces.team_chat_enabled=true
-- y LUEGO rpc('enable_team_chat', ...). Si el segundo paso fallaba (o la
-- petición se cortaba entre medias), el workspace quedaba con el Chat
-- "activado" pero sin canal General ni backfill de miembros, aunque la API
-- hubiera respondido 500 — un estado a medias indistinguible de un fallo
-- limpio. Una única función PL/pgSQL es la unidad atómica correcta en
-- Postgres: si CUALQUIER sentencia de aquí dentro lanza, TODO el efecto de
-- esta invocación (incluido el UPDATE de la bandera, que va primero) se
-- deshace — no hay forma de que team_chat_enabled quede en true sin que
-- General y el backfill también hayan quedado escritos, ni al revés.
--
-- p_human_member_limit es opcional: si se pasa, valida ANTES de escribir
-- nada que no sea inferior al número de miembros humanos activos actuales
-- (bajar el cupo por debajo de la ocupación real no es un estado válido) —
-- este es también el caso que ejercita la prueba de "fallo provocado" de la
-- revisión: un intento de activar con un límite ya insuficiente debe
-- fallar limpio, sin dejar team_chat_enabled en true ni General creado.
-- p_enabled y p_human_member_limit son ambos opcionales e independientes
-- (la UI de Ajustes→Negocio los edita con dos controles separados: el
-- interruptor y el campo de plazas) — se actualiza solo lo que llega
-- distinto de NULL, y el aprovisionamiento de General/backfill se evalúa
-- sobre el estado FINAL de team_chat_enabled tras el UPDATE, no sobre
-- p_enabled a secas, para que también sea correcto cuando esta llamada
-- solo toca el límite de plazas de un workspace que ya estaba activo.
CREATE OR REPLACE FUNCTION public.set_team_chat_enabled(
  p_workspace_id UUID,
  p_enabled BOOLEAN DEFAULT NULL,
  p_human_member_limit SMALLINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_human_count INT;
  v_general_id UUID;
  v_final_enabled BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'workspace % not found', p_workspace_id;
  END IF;

  IF p_enabled IS NULL AND p_human_member_limit IS NULL THEN
    RAISE EXCEPTION 'nothing to update';
  END IF;

  IF p_human_member_limit IS NOT NULL THEN
    SELECT count(*) INTO v_active_human_count
    FROM public.memberships m
    JOIN public.users u ON u.id = m.user_id
    WHERE m.workspace_id = p_workspace_id AND m.is_active = TRUE AND u.is_super_admin = FALSE;

    IF p_human_member_limit < v_active_human_count THEN
      RAISE EXCEPTION 'human_member_limit % is below the % active human members already in this workspace',
        p_human_member_limit, v_active_human_count;
    END IF;
  END IF;

  UPDATE public.workspaces
  SET
    team_chat_enabled = COALESCE(p_enabled, team_chat_enabled),
    human_member_limit = COALESCE(p_human_member_limit, human_member_limit)
  WHERE id = p_workspace_id
  RETURNING team_chat_enabled INTO v_final_enabled;

  IF NOT v_final_enabled THEN
    RETURN;
  END IF;

  SELECT id INTO v_general_id
  FROM public.team_channels
  WHERE workspace_id = p_workspace_id AND kind = 'general';

  IF v_general_id IS NULL THEN
    INSERT INTO public.team_channels (workspace_id, name, kind, created_by)
    VALUES (p_workspace_id, 'General', 'general', NULL)
    RETURNING id INTO v_general_id;
  END IF;

  INSERT INTO public.team_channel_members (channel_id, workspace_id, user_id, joined_at, last_read_at)
  SELECT v_general_id, p_workspace_id, m.user_id, now(), now()
  FROM public.memberships m
  WHERE m.workspace_id = p_workspace_id AND m.is_active = TRUE
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_chat_enabled(UUID, BOOLEAN, SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_team_chat_enabled(UUID, BOOLEAN, SMALLINT) TO service_role;

-- ---------------------------------------------------------------------------
-- get_or_create_dm_channel — abre (o crea) el DM canónico entre el usuario
-- que llama y otro miembro del mismo workspace. Deliberadamente NO recibe
-- "mi propio user_id" como parámetro: lo deriva de auth.uid() dentro de la
-- función, porque esta SÍ se concede a `authenticated` directamente (no
-- solo a service_role) y, al ser SECURITY DEFINER, hace bypass de RLS — si
-- aceptara el id del llamador como parámetro del cliente, cualquier
-- autenticado podría abrir/leer DMs ajenos pasando cualquier par de UUIDs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_or_create_dm_channel(
  p_workspace_id UUID,
  p_other_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_key TEXT;
  v_channel_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF v_caller = p_other_user_id THEN
    RAISE EXCEPTION 'cannot start a DM with yourself';
  END IF;

  -- Revisión de arquitectura (bloqueo 2): esta función validaba memberships
  -- pero nunca team_chat_enabled — un workspace con el Chat apagado (o un
  -- workspace_id inexistente) podía igualmente abrir/crear un canal DM.
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

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = p_workspace_id AND user_id = p_other_user_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'target user is not an active member of this workspace';
  END IF;

  v_key := LEAST(v_caller::text, p_other_user_id::text) || ':' || GREATEST(v_caller::text, p_other_user_id::text);

  SELECT id INTO v_channel_id
  FROM public.team_channels
  WHERE workspace_id = p_workspace_id AND direct_key = v_key;

  IF v_channel_id IS NOT NULL THEN
    RETURN v_channel_id;
  END IF;

  -- uq_team_channels_direct es un índice único PARCIAL (WHERE kind =
  -- 'direct'), no uno simple sobre (workspace_id, direct_key) — Postgres
  -- solo lo reconoce como destino de ON CONFLICT si el predicado se repite
  -- aquí exactamente. Sin el WHERE, esto fallaba en runtime con "there is
  -- no unique or exclusion constraint matching the ON CONFLICT
  -- specification" (detectado en la revisión visual de Fase 1, al abrir un
  -- DM de verdad — nunca se había ejercitado este camino hasta entonces).
  INSERT INTO public.team_channels (workspace_id, name, kind, created_by, direct_key)
  VALUES (p_workspace_id, 'DM', 'direct', v_caller, v_key)
  ON CONFLICT (workspace_id, direct_key) WHERE kind = 'direct' DO NOTHING
  RETURNING id INTO v_channel_id;

  IF v_channel_id IS NULL THEN
    -- Carrera perdida contra otra llamada concurrente que creó el mismo DM
    -- justo antes: leer la fila que sí se insertó.
    SELECT id INTO v_channel_id
    FROM public.team_channels
    WHERE workspace_id = p_workspace_id AND direct_key = v_key;
  END IF;

  INSERT INTO public.team_channel_members (channel_id, workspace_id, user_id, joined_at, last_read_at)
  VALUES
    (v_channel_id, p_workspace_id, v_caller, now(), now()),
    (v_channel_id, p_workspace_id, p_other_user_id, now(), now())
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN v_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_dm_channel(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_channel(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime Broadcast privado — el cliente solo se SUSCRIBE (recibe); el
-- servidor emite el evento después de persistir el mensaje (nunca al
-- revés), usando el cliente service-role. Por eso basta una policy de
-- SELECT (recibir) para `authenticated` sobre realtime.messages — no hace
-- falta INSERT porque el cliente nunca emite un broadcast directamente.
-- Tema/topic: `team:<channel_id>`.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "team chat broadcast receive" ON "realtime"."messages";
CREATE POLICY "team chat broadcast receive"
  ON "realtime"."messages"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.auth_team_channel_ids() AS my_channel_id
      WHERE 'team:' || my_channel_id::text = realtime.topic()
    )
  );

-- ============================================================
-- End of migration: 20260808000001_team_chat_schema
-- ============================================================
