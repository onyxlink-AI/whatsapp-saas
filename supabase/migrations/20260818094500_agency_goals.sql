-- ============================================================
-- Migration: 20260818094500_agency_goals
-- TAREA 2 — Dirección interna y módulo de Objetivos.
--
-- Tabla interna de OnyxLink (objetivos anuales/trimestrales/mensuales/
-- semanales de la propia agencia) — DELIBERADAMENTE sin workspace_id: no
-- son datos de ningún cliente, son datos internos de OnyxLink como
-- organización. El aislamiento aquí no es "por empresa" (como el resto del
-- esquema), es "por personal de plataforma": únicamente
-- internal_admin/super_admin (public.is_platform_staff(), TAREA 1/1B) puede
-- leer o escribir esta tabla — un cliente, incluido un admin de workspace,
-- no debe poder ver que esta tabla existe.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agency_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  period_type TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- Nullable siguiendo la misma convención que el resto del esquema para
  -- columnas "actor"/"created_by" (p. ej. content_items.created_by,
  -- notes.created_by: 20260608000000_foundation.sql) — ON DELETE SET NULL
  -- para no bloquear el borrado de una cuenta de usuario años después. La
  -- capa de servidor SIEMPRE rellena created_by desde el usuario
  -- autenticado en el momento de crear; nunca queda NULL en la práctica.
  -- Nombradas explícitamente (en vez de dejar el nombre por defecto de
  -- Postgres) porque hay DOS foreign keys a users desde esta tabla — el
  -- embed anidado de PostgREST (owner:users!fk_agency_goals_owner(...))
  -- necesita saber cuál de las dos usar, si no es ambiguo.
  owner_id UUID CONSTRAINT fk_agency_goals_owner REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  created_by UUID CONSTRAINT fk_agency_goals_created_by REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_agency_goals_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT chk_agency_goals_period_type CHECK (period_type IN ('annual', 'quarterly', 'monthly', 'weekly')),
  CONSTRAINT chk_agency_goals_status CHECK (status IN ('pending', 'in_progress', 'completed')),
  CONSTRAINT chk_agency_goals_progress_range CHECK (progress >= 0 AND progress <= 100),
  CONSTRAINT chk_agency_goals_period_order CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_agency_goals_period_type ON public.agency_goals (period_type);
CREATE INDEX IF NOT EXISTS idx_agency_goals_period_dates ON public.agency_goals (period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_agency_goals_owner ON public.agency_goals (owner_id);

CREATE OR REPLACE FUNCTION public.set_agency_goals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_goals_updated_at ON public.agency_goals;
CREATE TRIGGER trg_agency_goals_updated_at
  BEFORE UPDATE ON public.agency_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_agency_goals_updated_at();

-- ---------------------------------------------------------------------------
-- TAREA 2B — integridad frente a REST directo (PostgREST con el JWT de un
-- internal_admin/super_admin, que sí tiene INSERT/UPDATE vía RLS pero no
-- pasa por goal-actions.ts). Los tres triggers de abajo son la segunda
-- barrera: la primera (Server Actions) ya hace esto bien, pero RLS por sí
-- sola no impide que created_by/owner_id/period_* lleguen manipulados desde
-- fuera de la aplicación.
--
-- Ninguno necesita SECURITY DEFINER: corren con los privilegios de quien
-- ejecuta el INSERT/UPDATE (ya autorizado por RLS a intentarlo), y la
-- validación de responsable reutiliza a propósito la visibilidad ya
-- acotada por RLS sobre public.users (self/compañeros de workspace/
-- superadmin-ve-todo, más "users_select_staff_directory" de esta misma
-- migración) en vez de escalar privilegios — así no hace falta ninguna RPC
-- nueva que exponga el directorio de usuarios. SET search_path = '' y
-- nombres cualificados igualmente, por higiene, aunque no sea estrictamente
-- necesario sin SECURITY DEFINER.
-- ---------------------------------------------------------------------------

-- Problema 1 — created_by no falsificable: en INSERT se fuerza siempre a
-- auth.uid() cuando la sesión es un usuario real (auth.uid() no es NULL);
-- bajo service_role (sin JWT de usuario, auth.uid() = NULL) se respeta lo
-- que mande la llamada administrativa/de pruebas, sin forzar nada — así no
-- se rompe ningún fixture de test ni tarea administrativa.
--
-- TAREA 2C: en UPDATE, la inmutabilidad de created_by se aplica ÚNICAMENTE
-- cuando auth.uid() IS NOT NULL — es decir, únicamente cuando el UPDATE lo
-- dispara una sesión autenticada real de PostgREST. Un internal_admin/
-- super_admin autenticado que intente cambiar created_by (a otro UUID o a
-- NULL) siempre tiene auth.uid() no nulo, así que siempre se revierte —
-- no hay forma de "colarse" por esta rama enviando NULL a mano, porque la
-- condición depende de QUIÉN hace la petición, nunca de QUÉ valor manda.
--
-- Sin esta condición, la restricción original bloqueaba TAMBIÉN el UPDATE
-- interno que Postgres ejecuta para aplicar
-- "created_by REFERENCES public.users(id) ON DELETE SET NULL" al borrar al
-- usuario creador: esa acción referencial es una sentencia UPDATE real que
-- dispara los mismos triggers BEFORE UPDATE de la tabla, pero se ejecuta
-- fuera de una petición PostgREST (sin el JWT de un usuario final, sea la
-- conexión de GoTrue al borrar de auth.users, sea service_role), así que
-- auth.uid() es NULL en ese contexto — igual que en las llamadas
-- administrativas de INSERT — y el UPDATE puede completarse, dejando
-- created_by en NULL como se espera.
CREATE OR REPLACE FUNCTION public.enforce_agency_goals_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := OLD.created_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_goals_enforce_created_by ON public.agency_goals;
CREATE TRIGGER trg_agency_goals_enforce_created_by
  BEFORE INSERT OR UPDATE ON public.agency_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_goals_created_by();

-- Problema 2 — responsable no interno: owner_id NULL siempre se acepta sin
-- comprobar nada. Si no es NULL, debe existir en public.users con
-- platform_role IN ('internal_admin','super_admin') O is_super_admin=TRUE
-- (el superadministrador legado). La comprobación se re-evalúa en cada
-- INSERT/UPDATE (cambie o no owner_id) por simplicidad; es barata y no
-- tiene efectos secundarios. Nótese que esto NO depende de que la fila sea
-- "visible" bajo RLS para el invocador — se comprueba explícitamente la
-- condición de personal interno en el propio WHERE, así que el resultado es
-- correcto sin importar qué política de public.users aplique a quien llama.
CREATE OR REPLACE FUNCTION public.enforce_agency_goals_owner_is_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = NEW.owner_id
        AND (platform_role IN ('internal_admin', 'super_admin') OR is_super_admin = TRUE)
    ) THEN
      RAISE EXCEPTION 'agency_goals.owner_id must belong to platform staff (internal_admin or super_admin)'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_goals_validate_owner ON public.agency_goals;
CREATE TRIGGER trg_agency_goals_validate_owner
  BEFORE INSERT OR UPDATE ON public.agency_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_goals_owner_is_staff();

-- Problema 3 — periodos no canónicos: la única barrera previa era
-- period_end >= period_start (chk_agency_goals_period_order, se conserva
-- como respaldo). Este trigger exige que period_start/period_end sean
-- EXACTAMENTE los límites naturales del period_type declarado — segunda
-- barrera de base de datos; period-calculator.ts (servidor) sigue siendo
-- quien calcula las fechas en el flujo normal de la aplicación, esto solo
-- rechaza lo que llegue manipulado por fuera de ese flujo.
CREATE OR REPLACE FUNCTION public.enforce_agency_goals_canonical_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  CASE NEW.period_type
    WHEN 'annual' THEN
      IF NEW.period_start <> make_date(EXTRACT(YEAR FROM NEW.period_start)::int, 1, 1)
         OR NEW.period_end <> make_date(EXTRACT(YEAR FROM NEW.period_start)::int, 12, 31) THEN
        RAISE EXCEPTION 'agency_goals: annual period must run Jan 1 - Dec 31 of a single year'
          USING ERRCODE = '23514';
      END IF;
    WHEN 'quarterly' THEN
      IF NEW.period_start <> date_trunc('quarter', NEW.period_start)::date
         OR NEW.period_end <> (date_trunc('quarter', NEW.period_start) + INTERVAL '3 months' - INTERVAL '1 day')::date THEN
        RAISE EXCEPTION 'agency_goals: quarterly period must span exactly one natural calendar quarter'
          USING ERRCODE = '23514';
      END IF;
    WHEN 'monthly' THEN
      IF NEW.period_start <> date_trunc('month', NEW.period_start)::date
         OR NEW.period_end <> (date_trunc('month', NEW.period_start) + INTERVAL '1 month' - INTERVAL '1 day')::date THEN
        RAISE EXCEPTION 'agency_goals: monthly period must span exactly one full calendar month'
          USING ERRCODE = '23514';
      END IF;
    WHEN 'weekly' THEN
      IF EXTRACT(ISODOW FROM NEW.period_start) <> 1
         OR NEW.period_end <> NEW.period_start + 6 THEN
        RAISE EXCEPTION 'agency_goals: weekly period must run Monday through the following Sunday (6 days)'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'agency_goals: unknown period_type %', NEW.period_type
        USING ERRCODE = '23514';
  END CASE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_goals_validate_period ON public.agency_goals;
CREATE TRIGGER trg_agency_goals_validate_period
  BEFORE INSERT OR UPDATE ON public.agency_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_goals_canonical_period();

-- ---------------------------------------------------------------------------
-- RLS — únicamente personal de plataforma, en las 4 operaciones. Reutiliza
-- public.is_platform_staff() de TAREA 1B (ya cubre internal_admin,
-- super_admin, y el superadministrador legado is_super_admin=true) — no se
-- define ninguna lógica de autorización nueva aquí, solo se aplica la ya
-- existente. anon nunca tiene EXECUTE sobre is_platform_staff() (revocado en
-- 20260817140000), así que una fila de esta tabla jamás es visible sin
-- sesión, y una sesión de cliente normal evalúa is_platform_staff()=false
-- para las 4 políticas por igual.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_goals_select_staff" ON public.agency_goals;
CREATE POLICY "agency_goals_select_staff"
  ON public.agency_goals FOR SELECT
  USING (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_goals_insert_staff" ON public.agency_goals;
CREATE POLICY "agency_goals_insert_staff"
  ON public.agency_goals FOR INSERT
  WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_goals_update_staff" ON public.agency_goals;
CREATE POLICY "agency_goals_update_staff"
  ON public.agency_goals FOR UPDATE
  USING (public.is_platform_staff())
  WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_goals_delete_staff" ON public.agency_goals;
CREATE POLICY "agency_goals_delete_staff"
  ON public.agency_goals FOR DELETE
  USING (public.is_platform_staff());

-- Privilegios de tabla: authenticated los necesita para que RLS pueda
-- evaluarse en absoluto (igual que el resto del esquema — RLS decide QUÉ
-- filas, los privilegios de tabla deciden si el rol puede intentar la
-- operación). anon nunca los recibe: ni siquiera llega a evaluar RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_goals TO authenticated;
REVOKE ALL ON public.agency_goals FROM anon;

-- ---------------------------------------------------------------------------
-- Directorio de personal para el selector de responsable de Objetivos.
--
-- "users_select_scoped" (20260808000000_team_chat_entitlements.sql) ya
-- permite ver la propia fila, compañeros de un workspace compartido, o
-- todo si eres super_admin — pero un internal_admin normalmente NO
-- pertenece a ningún workspace, así que con esa política solo vería su
-- propia fila y no podría asignar el objetivo a ningún otro compañero
-- interno. Se añade una política SELECT adicional (las políticas para el
-- mismo comando se combinan con OR, así que esto no reemplaza ni debilita
-- la existente): un llamador que sea personal de plataforma puede ver
-- OTRAS filas que TAMBIÉN sean personal de plataforma — nunca las de un
-- cliente cualquiera. Esto es deliberadamente más estrecho que "todo
-- authenticated ve todo si es staff": la condición se aplica dos veces,
-- una sobre quién pregunta (is_platform_staff()) y otra sobre la fila en
-- sí (platform_role IS NOT NULL OR is_super_admin), así que no amplía en
-- absoluto la visibilidad de datos de clientes.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users_select_staff_directory" ON public.users;
CREATE POLICY "users_select_staff_directory"
  ON public.users FOR SELECT
  USING (
    public.is_platform_staff()
    AND (platform_role IS NOT NULL OR is_super_admin = TRUE)
  );

-- ============================================================
-- End of migration: 20260818094500_agency_goals
-- ============================================================
