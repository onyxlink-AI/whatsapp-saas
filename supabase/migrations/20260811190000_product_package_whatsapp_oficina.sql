-- ============================================================
-- Migration: 20260811190000_product_package_whatsapp_oficina
-- Añade el Paquete 4 comercial `whatsapp_oficina` (Agente de WhatsApp +
-- Oficina Virtual, sin Gestión) al sistema canónico introducido en
-- 20260808000007_product_package.sql.
--
-- Ningún workspace existente usa este valor todavía — no hace falta
-- backfill de filas, solo ampliar el CHECK constraint y la función
-- set_workspace_product_package() para aceptarlo y derivar sus flags.
--
-- También amplía chk_whatsapp_requires_gestion (20260805000000): esa
-- migración prohibió a propósito "WhatsApp sin Gestión" como estado válido
-- (Fase 1 del roadmap comercial exigía que el Agente de WhatsApp incluyera
-- siempre Gestión). whatsapp_oficina es exactamente lo contrario por
-- decisión explícita del usuario en esta tarea — sin ampliar el check,
-- set_workspace_product_package() no podría escribir sus flags
-- (whatsapp_agent_enabled=true, gestion_enabled=false) y fallaría con
-- "violates check constraint". Se añade `OR office_virtual_enabled = true`:
-- permite WhatsApp sin Gestión únicamente cuando Oficina Virtual también
-- está activa (el único caso legítimo hoy, whatsapp_oficina), y sigue
-- bloqueando el caso de "deriva" que el constraint original prevenía (un
-- workspace con whatsapp=true y ni Gestión ni Oficina). Mismo NOT VALID que
-- el original — no revalida filas existentes.
-- ============================================================

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_product_package_valid;
ALTER TABLE workspaces
  ADD CONSTRAINT chk_product_package_valid
  CHECK (product_package IN ('none', 'gestion', 'whatsapp_gestion', 'whatsapp_oficina', 'suite'));

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_whatsapp_requires_gestion;
ALTER TABLE workspaces
  ADD CONSTRAINT chk_whatsapp_requires_gestion
  CHECK (whatsapp_agent_enabled = false OR gestion_enabled = true OR office_virtual_enabled = true)
  NOT VALID;

-- ---------------------------------------------------------------------------
-- set_workspace_product_package — mismo cuerpo que 20260808000007, solo
-- amplía la validación y la derivación de whatsapp_agent_enabled /
-- office_virtual_enabled para incluir 'whatsapp_oficina'.
-- gestion_enabled y whiteboard_enabled no cambian: whatsapp_oficina queda
-- deliberadamente fuera de gestion_enabled (es la razón de ser de este
-- paquete) y whiteboard_enabled ya se concede a cualquier paquete <> 'none'.
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
  IF p_package NOT IN ('none', 'gestion', 'whatsapp_gestion', 'whatsapp_oficina', 'suite') THEN
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
    whatsapp_agent_enabled = (p_package IN ('whatsapp_gestion', 'suite', 'whatsapp_oficina')),
    office_virtual_enabled = (p_package IN ('suite', 'whatsapp_oficina')),
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
-- End of migration: 20260811190000_product_package_whatsapp_oficina
-- ============================================================
