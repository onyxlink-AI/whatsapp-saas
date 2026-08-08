-- ============================================================
-- Migration: 20260808000007_product_package
-- Fase 2 del roadmap comercial
-- (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §2):
-- fuente de verdad canónica del paquete comercial + mutación atómica.
--
-- Los booleanos existentes (gestion_enabled, whatsapp_agent_enabled,
-- office_virtual_enabled, whiteboard_enabled) se conservan — el resto del
-- código (RLS, help-assistant, etc.) sigue leyéndolos tal cual — pero a
-- partir de ahora se escriben SIEMPRE en conjunto desde
-- set_workspace_product_package(), nunca sueltos.
--
-- Chat de equipo (team_chat_enabled, human_member_limit,
-- team_chat_storage_quota_mb) es un add-on independiente del paquete
-- (§2.3): set_workspace_product_package() NUNCA lo lee ni lo escribe, en
-- ningún sentido — ni upgrade ni downgrade de paquete modifican Chat, su
-- cupo de plazas ni su cuota de almacenamiento. Esta migración incluyó en
-- su primera versión una llamada a team_chat_backfill_seat_limit() desde
-- dentro de la función para "mantener el cupo coherente" tras un cambio de
-- paquete; se eliminó por completo en la revisión correctiva porque
-- constituye un efecto secundario sobre un add-on ajeno al paquete, aunque
-- solo pudiera subir el cupo. team_chat_backfill_seat_limit() sigue
-- existiendo y se sigue usando desde las operaciones propias de Chat de
-- equipo (p. ej. set_team_chat_enabled()), pero set_workspace_product_package()
-- no la invoca ni depende de ella.
--
-- chatbot_enabled queda deliberadamente fuera: hoy no es self-service (ver
-- src/features/chatbot/access.ts — solo un superadmin lo ve, pase lo que
-- pase con el flag), así que no es una capacidad comercial que un paquete
-- pueda "incluir" todavía. Decisión confirmada con el usuario antes de
-- escribir esta migración.
-- ============================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS product_package TEXT NOT NULL DEFAULT 'none';

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_product_package_valid;
ALTER TABLE workspaces
  ADD CONSTRAINT chk_product_package_valid
  CHECK (product_package IN ('none', 'gestion', 'whatsapp_gestion', 'suite'));

-- ---------------------------------------------------------------------------
-- Backfill — clasifica cada workspace existente en uno de los 4 cubos
-- canónicos del §2.5 a partir de sus booleanos actuales. Si alguno no
-- clasifica limpio (ej. Oficina activada sin WhatsApp/Gestión — un estado
-- históricamente incoherente que el propio encargo prohíbe "corregir en
-- silencio"), la migración ABORTA con un diagnóstico exacto en vez de
-- adivinar un cubo. Board (whiteboard_enabled) pasa a concederse
-- automáticamente a todo workspace que quede con un paquete distinto de
-- 'none' — decisión confirmada con el usuario: la matriz del §2.2 lo marca
-- "Sí" en los 3 paquetes, así que ya no es un flag independiente.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_bad_count INT;
  v_bad_detail TEXT;
BEGIN
  SELECT count(*), string_agg(
    format('  - id=%s name=%s gestion=%s whatsapp=%s office=%s', id, name, gestion_enabled, whatsapp_agent_enabled, office_virtual_enabled),
    E'\n'
  )
  INTO v_bad_count, v_bad_detail
  FROM workspaces
  WHERE NOT (
    (NOT gestion_enabled AND NOT whatsapp_agent_enabled AND NOT office_virtual_enabled)
    OR (gestion_enabled AND NOT whatsapp_agent_enabled AND NOT office_virtual_enabled)
    OR (gestion_enabled AND whatsapp_agent_enabled AND NOT office_virtual_enabled)
    OR (gestion_enabled AND whatsapp_agent_enabled AND office_virtual_enabled)
  );

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION E'product_package backfill abortado: % workspace(s) con una combinación gestion/whatsapp/oficina que no clasifica en los 4 cubos canónicos (Sin paquete/Gestión/WhatsApp+Gestión/Suite) — resolver a mano antes de reintentar, nunca corregir en silencio:\n%',
      v_bad_count, v_bad_detail;
  END IF;

  UPDATE workspaces SET product_package = CASE
    WHEN gestion_enabled AND whatsapp_agent_enabled AND office_virtual_enabled THEN 'suite'
    WHEN gestion_enabled AND whatsapp_agent_enabled THEN 'whatsapp_gestion'
    WHEN gestion_enabled THEN 'gestion'
    ELSE 'none'
  END;

  UPDATE workspaces
  SET whiteboard_enabled = TRUE
  WHERE product_package <> 'none' AND whiteboard_enabled = FALSE;
END $$;

-- ---------------------------------------------------------------------------
-- set_workspace_product_package — única vía autorizada para cambiar de
-- paquete: bloquea la fila FOR UPDATE, valida el valor, y escribe paquete +
-- los 4 flags derivados en una sola UPDATE (todo o nada). No tiene ningún
-- otro efecto: nunca toca chatbot_enabled, team_chat_enabled,
-- human_member_limit, team_chat_storage_quota_mb, vapi_assistant_id ni
-- ningún otro add-on — add-ons y kill-switches quedan completamente fuera
-- del paquete (§2.3). En particular, Chat de equipo (su estado activado,
-- su cupo de plazas y su cuota de almacenamiento) permanece exactamente
-- igual antes y después de cualquier upgrade o downgrade de paquete —
-- nunca se recalcula ni se re-sincroniza desde aquí.
--
-- Devuelve el estado ANTERIOR y el NUEVO en un único jsonb para que la
-- ruta API pueda auditar el cambio exacto sin una segunda consulta.
--
-- REVOKE explícito de anon Y authenticated desde el primer commit — lección
-- de la incidencia de seguridad de esta sesión (20260808000002): en este
-- proyecto, REVOKE ALL ... FROM PUBLIC por sí solo no basta para bloquear a
-- anon/authenticated en una función SECURITY DEFINER.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_workspace_product_package(
  p_workspace_id UUID,
  p_package TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous JSONB;
  v_next JSONB;
BEGIN
  IF p_package NOT IN ('none', 'gestion', 'whatsapp_gestion', 'suite') THEN
    RAISE EXCEPTION 'invalid product_package %', p_package;
  END IF;

  SELECT jsonb_build_object(
    'package', product_package,
    'gestionEnabled', gestion_enabled,
    'whatsappAgentEnabled', whatsapp_agent_enabled,
    'officeVirtualEnabled', office_virtual_enabled,
    'whiteboardEnabled', whiteboard_enabled
  )
  INTO v_previous
  FROM public.workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;

  IF v_previous IS NULL THEN
    RAISE EXCEPTION 'workspace % not found', p_workspace_id;
  END IF;

  -- La UPDATE de abajo solo escribe product_package + los 4 flags
  -- derivados — nada de Chat de equipo (§2.3, ver cabecera de esta
  -- migración). Si algún día un downgrade deja el cupo de plazas por
  -- debajo del mínimo comercial de un paquete, eso se resuelve con una
  -- operación explícita de Chat de equipo, nunca aquí.
  UPDATE public.workspaces
  SET
    product_package = p_package,
    gestion_enabled = (p_package IN ('gestion', 'whatsapp_gestion', 'suite')),
    whatsapp_agent_enabled = (p_package IN ('whatsapp_gestion', 'suite')),
    office_virtual_enabled = (p_package = 'suite'),
    whiteboard_enabled = (p_package <> 'none')
  WHERE id = p_workspace_id;

  SELECT jsonb_build_object(
    'package', product_package,
    'gestionEnabled', gestion_enabled,
    'whatsappAgentEnabled', whatsapp_agent_enabled,
    'officeVirtualEnabled', office_virtual_enabled,
    'whiteboardEnabled', whiteboard_enabled
  )
  INTO v_next
  FROM public.workspaces
  WHERE id = p_workspace_id;

  RETURN jsonb_build_object('previous', v_previous, 'next', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_product_package(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_workspace_product_package(UUID, TEXT) TO service_role;

-- ============================================================
-- End of migration: 20260808000007_product_package
-- ============================================================
