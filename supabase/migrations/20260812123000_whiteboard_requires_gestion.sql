-- ============================================================
-- Migration: 20260812123000_whiteboard_requires_gestion
-- Cambio de decisión de producto (pedido explícito del usuario): Board deja
-- de incluirse automáticamente en todo paquete no-"none" — a partir de
-- ahora Board vive DENTRO de Gestión, igual que Clientes/Proyectos/Agenda.
-- Si un workspace no tiene Gestión, tampoco tiene Board, sin excepción.
--
-- Afecta a los paquetes que hoy dan whiteboard_enabled=true sin Gestión:
-- whatsapp (Paquete 5), oficina (Paquete 6) y whatsapp_oficina (Paquete 4).
-- gestion, whatsapp_gestion y suite no cambian (ya tenían Gestión, así que
-- ya tenían Board).
-- ============================================================

-- Backfill: recalcula whiteboard_enabled para cualquier workspace que ya
-- esté en uno de los 3 paquetes afectados (probablemente ninguno todavía,
-- son paquetes recién creados, pero es idempotente y no asume nada).
UPDATE workspaces
SET whiteboard_enabled = gestion_enabled
WHERE product_package IN ('whatsapp', 'oficina', 'whatsapp_oficina')
  AND whiteboard_enabled <> gestion_enabled;

-- Refuerzo a nivel de base de datos: whiteboard_enabled nunca puede ir por
-- delante de gestion_enabled. NOT VALID por el mismo motivo que los
-- constraints anteriores de este sistema — no revalida filas ya existentes
-- fuera de los 3 paquetes de arriba (backfill ya las deja consistentes).
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_whiteboard_requires_gestion;
ALTER TABLE workspaces
  ADD CONSTRAINT chk_whiteboard_requires_gestion
  CHECK (whiteboard_enabled = false OR gestion_enabled = true)
  NOT VALID;

-- ---------------------------------------------------------------------------
-- set_workspace_product_package — mismo cuerpo que 20260811194000, cambia
-- únicamente la derivación de whiteboard_enabled: antes `<> 'none'` (todo
-- paquete no vacío), ahora exactamente el mismo IN-list que gestion_enabled.
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
  IF p_package NOT IN ('none', 'gestion', 'whatsapp_gestion', 'whatsapp', 'oficina', 'whatsapp_oficina', 'suite') THEN
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

  UPDATE public.workspaces
  SET
    product_package = p_package,
    gestion_enabled = (p_package IN ('gestion', 'whatsapp_gestion', 'suite')),
    whatsapp_agent_enabled = (p_package IN ('whatsapp_gestion', 'suite', 'whatsapp_oficina', 'whatsapp')),
    office_virtual_enabled = (p_package IN ('suite', 'whatsapp_oficina', 'oficina')),
    whiteboard_enabled = (p_package IN ('gestion', 'whatsapp_gestion', 'suite'))
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
-- End of migration: 20260812123000_whiteboard_requires_gestion
-- ============================================================
