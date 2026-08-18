-- ============================================================
-- Migration: 20260817140000_platform_role_staff_separation
-- TAREA 1 — Separación segura entre administradores internos y clientes.
--
-- Hoy `memberships.role = 'admin'` no distingue a un administrador CLIENTE
-- (admin de SU workspace) de un trabajador interno de OnyxLink — ambos son
-- literalmente el mismo valor en la misma columna. Esta migración añade una
-- capacidad de plataforma independiente de cualquier workspace:
-- `users.platform_role`, con exactamente 3 estados: NULL (nadie de
-- OnyxLink), 'internal_admin' (personal interno) y 'super_admin'.
--
-- `is_super_admin` (booleano, 20260609000001_super_admin.sql) y su función
-- `public.is_super_admin()` NO se tocan en esta migración — siguen
-- exactamente igual, y las 5 políticas RLS que ya llaman a
-- `public.is_super_admin()` (workspaces_select_members,
-- memberships_select_members, super_admin_insert_workspaces,
-- super_admin_insert_memberships, users_select_scoped) no cambian de
-- comportamiento. `platform_role` es una capa NUEVA y aditiva: se
-- backfillea una sola vez desde `is_super_admin` para los usuarios que ya
-- existen, y a partir de ahora convive con el booleano viejo hasta que un
-- trabajo futuro decida retirarlo (expandir → convivir → retirar, según
-- ONYXLINK-PROTOCOLO-ACTUALIZACIONES-SIN-DOWNTIME.md).
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS platform_role TEXT;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_platform_role_valid;
ALTER TABLE public.users
  ADD CONSTRAINT chk_users_platform_role_valid
  CHECK (platform_role IS NULL OR platform_role IN ('internal_admin', 'super_admin'));

-- ---------------------------------------------------------------------------
-- Backfill único: todo usuario ya marcado is_super_admin=true queda también
-- como platform_role='super_admin'. No hay ningún internal_admin todavía —
-- esta migración no construye la interfaz para asignarlos (fuera de
-- alcance de la Tarea 1), así que nadie más puede clasificar como tal.
-- ---------------------------------------------------------------------------

UPDATE public.users
SET platform_role = 'super_admin'
WHERE is_super_admin = TRUE
  AND platform_role IS DISTINCT FROM 'super_admin';

-- ---------------------------------------------------------------------------
-- Bloqueo de auto-escalada A NIVEL DE BASE DE DATOS, no solo de interfaz.
--
-- La política ya existente "users_update_own" (20260608000000_foundation.sql)
-- permite a cualquier usuario autenticado hacer UPDATE de SU PROPIA fila sin
-- restringir qué columnas puede tocar:
--
--   CREATE POLICY "users_update_own" ON users FOR UPDATE
--     USING (id = auth.uid()) WITH CHECK (id = auth.uid());
--
-- Sin más, cualquier cliente (incluido un admin de workspace) podría
-- auto-asignarse platform_role='super_admin' con un PATCH directo a
-- PostgREST (`/rest/v1/users?id=eq.<su-propio-id>`), porque la RLS solo
-- comprueba de quién es la fila, nunca qué campos cambian.
--
-- Un REVOKE de columna por sí solo NO basta aquí: Supabase concede UPDATE
-- de TABLA COMPLETA a authenticated/anon por defecto (confirmado:
-- has_column_privilege('authenticated','public.users','platform_role','UPDATE')
-- seguía dando true después de revocar solo la columna) — un privilegio de
-- tabla completa implica UPDATE en todas sus columnas, y revocar una
-- columna sin revocar antes la tabla no resta nada de ese privilegio más
-- amplio. La secuencia correcta es revocar la tabla completa y conceder de
-- vuelta, columna a columna, únicamente lo que debe seguir siendo
-- autoeditable.
--
-- is_super_admin se revoca en el mismo movimiento: es el flag legado que
-- credentialsSuperAdmin()/is_super_admin() siguen tratando como equivalente
-- a super_admin durante la compatibilidad temporal (ver
-- requireSuperAdmin()), así que dejarlo autoeditable anularía por completo
-- esta protección — un atacante simplemente pondría is_super_admin=true en
-- vez de platform_role='super_admin'. Este agujero YA EXISTÍA antes de esta
-- tarea (users_update_own nunca lo impidió); se cierra aquí junto con
-- platform_role porque es exactamente el mismo tipo de escalada que pide
-- impedir la Tarea 1.
--
-- full_name, avatar_url, is_active, email, created_at y updated_at
-- mantienen exactamente el mismo acceso de autoedición que ya tenían — esta
-- migración no restringe ninguna otra columna ni comportamiento existente
-- (ninguna ruta de la aplicación hace hoy UPDATE de `users` a través del
-- cliente con sesión: markAsSuperAdmin() en signup-gate.ts es la única
-- escritura real y usa el cliente service_role, que sigue con BYPASSRLS y
-- todos los privilegios sin cambios).
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON public.users FROM authenticated, anon;
GRANT UPDATE (full_name, avatar_url, is_active, email, created_at, updated_at) ON public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- public.is_platform_staff() — helper RLS para tablas internas futuras
-- (el apartado Dirección y similares), mismo patrón que
-- public.is_super_admin(): SECURITY DEFINER porque lee directamente
-- users.platform_role sin pasar por RLS (evita recursión de política),
-- STABLE porque no muta nada, search_path fijo a '' por higiene (mismo
-- estilo que el resto de funciones RLS del proyecto).
--
-- Devuelve TRUE únicamente para internal_admin, super_admin, o el legado
-- is_super_admin=true — jamás para memberships.role='admin' de un
-- workspace cliente, que no toca ninguna de estas columnas.
--
-- TAREA 1B: incluye `OR is_super_admin = TRUE` a propósito durante la
-- convivencia — sin esto, un superadministrador legado (is_super_admin=true,
-- platform_role todavía NULL, p. ej. si el backfill de arriba no ha corrido
-- aún sobre esa fila en concreto) pasaría requireSuperAdmin() en la capa
-- TypeScript pero fallaría is_platform_staff() en RLS, dejando a un mismo
-- usuario con acceso desigual según qué comprobación evalúe cada ruta. Es
-- seguro añadirlo aquí precisamente porque esta misma migración revoca
-- UPDATE(is_super_admin) de authenticated/anon más arriba — nadie puede
-- fabricarse este atajo escribiendo is_super_admin=true por su cuenta.
--
-- Grants correctos desde el primer commit: 20260723010000 documentó que
-- `REVOKE EXECUTE ... FROM anon` es un no-op (PostgreSQL concede EXECUTE a
-- PUBLIC por defecto, y anon es miembro implícito de PUBLIC) — aquí se
-- revoca de PUBLIC directamente y se concede explícitamente a
-- authenticated, nunca a anon.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT platform_role IN ('internal_admin', 'super_admin') OR is_super_admin = TRUE
      FROM public.users
      WHERE id = auth.uid()
    ),
    FALSE
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO authenticated;

-- ============================================================
-- End of migration: 20260817140000_platform_role_staff_separation
-- ============================================================
