-- ============================================================
-- Migration: 20260808000008_content_script_generation_rate_limit
-- Revisión correctiva de Fase 3 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §5):
-- "Generar guion con IA" tiene coste real (OpenRouter, pagado por el
-- cliente) — el límite de 15/hora por workspace+usuario NO puede
-- implementarse como "SELECT count → llamar al proveedor → INSERT" desde
-- el servidor de la app: dos peticiones concurrentes leerían el mismo
-- count antes de que ninguna insertara su fila, y ambas pasarían el
-- límite (TOCTOU). reserve_content_script_generation() hace el conteo Y
-- la reserva en una única llamada atómica del lado de Postgres, usando un
-- advisory lock transaccional por (workspace_id, user_id) para serializar
-- llamadas concurrentes del mismo par — nadie más puede colarse mientras
-- se sostiene el lock, y el lock se libera solo al terminar la función.
--
-- Cuenta INTENTOS AUTORIZADOS (se reserva antes de llamar a OpenRouter),
-- no generaciones exitosas — decisión explícita: es la protección
-- económica más simple y no exige "liberar" la reserva si la llamada al
-- modelo falla después. Si el cliente reintenta tras un fallo, ese
-- reintento consume otra unidad del cupo, igual que cualquier otro
-- intento.
--
-- Reutiliza la tabla events existente (mismo patrón que
-- help-assistant/services/quota.ts) en vez de una tabla dedicada — el
-- índice idx_events_type ya cubre (workspace_id, type, created_at).
--
-- REVOKE explícito de anon Y authenticated desde el primer commit — misma
-- lección de seguridad que set_workspace_product_package()
-- (20260808000002): REVOKE ALL ... FROM PUBLIC por sí solo no basta en
-- este proyecto.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reserve_content_script_generation(
  p_workspace_id UUID,
  p_user_id UUID,
  p_window_seconds INT DEFAULT 3600,
  p_max_per_window INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lock_key BIGINT;
  v_since TIMESTAMPTZ;
  v_count INT;
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

  -- Advisory lock TRANSACCIONAL (se libera solo al terminar esta llamada,
  -- nunca antes) para el par workspace+usuario — serializa exactamente las
  -- llamadas concurrentes que compiten por el mismo cupo. hashtextextended
  -- da un bigint estable de 64 bits a partir de los dos UUID.
  v_lock_key := hashtextextended(p_workspace_id::text || ':' || p_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_since := now() - (p_window_seconds || ' seconds')::interval;

  SELECT count(*) INTO v_count
  FROM public.events
  WHERE type = 'content_script_generation'
    AND workspace_id = p_workspace_id
    AND (payload ->> 'user_id') = p_user_id::text
    AND created_at >= v_since;

  IF v_count >= p_max_per_window THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_count, 'limit', p_max_per_window);
  END IF;

  INSERT INTO public.events (type, level, workspace_id, conversation_id, payload)
  VALUES (
    'content_script_generation',
    'info',
    p_workspace_id,
    NULL,
    jsonb_build_object('user_id', p_user_id)
  );

  RETURN jsonb_build_object('allowed', true, 'used', v_count + 1, 'limit', p_max_per_window);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_content_script_generation(UUID, UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_content_script_generation(UUID, UUID, INT, INT) TO service_role;

-- ============================================================
-- End of migration: 20260808000008_content_script_generation_rate_limit
-- ============================================================
