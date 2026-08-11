-- ============================================================
-- Migration: 20260811194000_product_package_solo_whatsapp_oficina
-- Añade el Paquete 5 (`whatsapp`: solo Agente de WhatsApp) y el Paquete 6
-- (`oficina`: solo Oficina Virtual) al sistema canónico. Ningún workspace
-- existente usa estos valores todavía — no hace falta backfill.
--
-- chk_whatsapp_requires_gestion (20260805000000) se sustituye por un CHECK
-- que enumera exhaustivamente las 7 combinaciones (gestion, whatsapp,
-- oficina) que los 7 paquetes hoy soportados pueden producir, en vez de
-- seguir encadenando OR: con 6 paquetes activos y creciendo, una lista
-- explícita de tuplas es más clara y más difícil de dejar un hueco sin
-- querer que un condicional booleano. Deja fuera a propósito la única
-- combinación que no vende hoy: Gestión+Oficina sin WhatsApp
-- (true, false, true) — si algún día se ofrece, se añade aquí explícitamente
-- junto con el paquete que la use, nunca antes.
-- ============================================================

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_product_package_valid;
ALTER TABLE workspaces
  ADD CONSTRAINT chk_product_package_valid
  CHECK (product_package IN ('none', 'gestion', 'whatsapp_gestion', 'whatsapp', 'oficina', 'whatsapp_oficina', 'suite'));

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_whatsapp_requires_gestion;
ALTER TABLE workspaces
  ADD CONSTRAINT chk_gestion_whatsapp_oficina_combo_valid
  CHECK (
    (gestion_enabled, whatsapp_agent_enabled, office_virtual_enabled) IN (
      (false, false, false), -- none
      (true, false, false),  -- gestion
      (true, true, false),   -- whatsapp_gestion
      (false, true, false),  -- whatsapp (solo)
      (false, false, true),  -- oficina (solo)
      (false, true, true),   -- whatsapp_oficina
      (true, true, true)     -- suite
    )
  )
  NOT VALID;

-- ---------------------------------------------------------------------------
-- set_workspace_product_package — mismo cuerpo que 20260811190000, amplía la
-- validación y la derivación de whatsapp_agent_enabled / office_virtual_enabled
-- para incluir los 2 paquetes nuevos.
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
-- End of migration: 20260811194000_product_package_solo_whatsapp_oficina
-- ============================================================
