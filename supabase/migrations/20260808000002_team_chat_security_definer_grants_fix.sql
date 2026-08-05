-- ============================================================
-- Migration: 20260808000002_team_chat_security_definer_grants_fix
-- Corrección de seguridad urgente, detectada con
-- `supabase inspect db advisors --linked` tras desplegar el Chat de equipo
-- Fase 1 a producción: claim_workspace_seat(), set_team_chat_enabled() y
-- team_chat_backfill_seat_limit() quedaron ejecutables directamente vía
-- REST (/rest/v1/rpc/...) por los roles `anon` y `authenticated`, pese a
-- que cada una llevaba `REVOKE ALL ... FROM PUBLIC` seguido de
-- `GRANT EXECUTE ... TO service_role` — el mismo patrón que sí basta para
-- las funciones RLS-helper de la base de este proyecto
-- (20260723010000_revoke_public_execute_rls_helpers.sql). `REVOKE ... FROM
-- PUBLIC` solo retira lo heredado vía el pseudo-rol PUBLIC: no toca un
-- GRANT concedido de forma directa a `anon`/`authenticated`, y algo a
-- nivel de este proyecto de Supabase concede EXECUTE directo a ambos roles
-- en toda función nueva del esquema `public` (el mismo síntoma aparece en
-- funciones preexistentes no tocadas por el Chat: cancel_batch,
-- claim_next_batch, check_outbound_24h_window — brecha sistémica del
-- proyecto, no exclusiva de esta migración).
--
-- Ninguna de estas tres funciones comprueba internamente quién llama —
-- confían en que la ruta API ya autorizó al llamador
-- (requireWorkspaceMember/requireSuperAdmin) antes de invocarlas con el
-- cliente service-role. Ejecutables sin esa comprobación:
--
--   - claim_workspace_seat: cualquiera (incluso sin sesión) podía crear o
--     reactivar una membership con CUALQUIER rol (incluido admin) para
--     CUALQUIER usuario en CUALQUIER workspace.
--   - set_team_chat_enabled: cualquiera podía activar/desactivar el Chat y
--     cambiar el límite de plazas de CUALQUIER workspace.
--   - team_chat_backfill_seat_limit: cualquiera podía forzar el
--     recálculo del límite de plazas de CUALQUIER workspace.
--
-- Fix: revocar EXECUTE de anon Y authenticated de forma explícita (no solo
-- de PUBLIC) en las tres, dejando únicamente service_role — que es el
-- único cliente que las invoca legítimamente, siempre después de que la
-- ruta API ya autorizó la operación.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.claim_workspace_seat(UUID, UUID, public.workspace_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_seat(UUID, UUID, public.workspace_role) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_team_chat_enabled(UUID, BOOLEAN, SMALLINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_chat_enabled(UUID, BOOLEAN, SMALLINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.team_chat_backfill_seat_limit(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_chat_backfill_seat_limit(UUID) TO service_role;

-- ============================================================
-- End of migration: 20260808000002_team_chat_security_definer_grants_fix
-- ============================================================
