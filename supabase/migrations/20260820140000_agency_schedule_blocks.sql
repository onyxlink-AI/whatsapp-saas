-- ============================================================
-- Migration: 20260820140000_agency_schedule_blocks
-- TAREA 4A — Fundamento seguro del horario semanal interno de Operaciones.
--
-- Horario interno GLOBAL de OnyxLink como empresa (plantilla semanal
-- recurrente, lunes a domingo, 24 celdas por día) — DELIBERADAMENTE sin
-- workspace_id: no es el calendario que OnyxLink vende a sus clientes, es
-- el horario propio de sus responsables internos para indicar a qué hora se
-- conectan, qué actividad van a realizar o qué trabajo tienen previsto.
-- Mismo aislamiento que agency_goals/agency_kpis (TAREA 2/3): únicamente
-- personal de plataforma (public.is_platform_staff(), TAREA 1B) puede leer
-- o escribir; un cliente, incluido un admin de workspace, no debe poder ver
-- que esta tabla existe.
--
-- Fuera de alcance deliberado de esta tabla: fechas concretas, recurrencia
-- configurable, duración variable, Google Calendar. Cada fila es
-- literalmente una celda (weekday, hour) de la plantilla semanal — nunca una
-- ocurrencia con fecha real. El "content" de cada celda es texto libre y
-- NUNCA se convierte en una fila de public.tasks/public.agenda_tasks: esas
-- tablas son para Gestión y para clientes; este horario es interno y
-- permanece completamente separado.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agency_schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday SMALLINT NOT NULL, -- 1 = lunes .. 7 = domingo
  hour SMALLINT NOT NULL, -- 0..23; hour=23 representa 23:00-00:00
  content TEXT NOT NULL,
  color_key TEXT NOT NULL,
  -- Tres FKs a users desde esta misma tabla — nombradas explícitamente
  -- (mismo motivo que agency_goals.owner_id/created_by): el embed anidado de
  -- PostgREST (responsible:users!fk_agency_schedule_blocks_responsible(...))
  -- necesita saber cuál usar; sin nombre sería ambiguo con tres candidatas.
  responsible_id UUID CONSTRAINT fk_agency_schedule_blocks_responsible REFERENCES public.users(id) ON DELETE SET NULL,
  created_by UUID CONSTRAINT fk_agency_schedule_blocks_created_by REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID CONSTRAINT fk_agency_schedule_blocks_updated_by REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_agency_schedule_blocks_weekday_range CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT chk_agency_schedule_blocks_hour_range CHECK (hour BETWEEN 0 AND 23),
  CONSTRAINT chk_agency_schedule_blocks_content_not_blank CHECK (btrim(content) <> ''),
  CONSTRAINT chk_agency_schedule_blocks_content_max_length CHECK (char_length(content) <= 500),
  CONSTRAINT chk_agency_schedule_blocks_color_key CHECK (color_key IN ('teal', 'blue', 'violet', 'amber', 'rose', 'slate')),
  CONSTRAINT uq_agency_schedule_blocks_weekday_hour UNIQUE (weekday, hour)
);

CREATE INDEX IF NOT EXISTS idx_agency_schedule_blocks_responsible ON public.agency_schedule_blocks (responsible_id);

CREATE OR REPLACE FUNCTION public.set_agency_schedule_blocks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_schedule_blocks_updated_at ON public.agency_schedule_blocks;
CREATE TRIGGER trg_agency_schedule_blocks_updated_at
  BEFORE UPDATE ON public.agency_schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_agency_schedule_blocks_updated_at();

-- ---------------------------------------------------------------------------
-- Integridad frente a REST directo (PostgREST con el JWT de un
-- internal_admin/super_admin, que sí tiene INSERT/UPDATE vía RLS pero no
-- pasa por schedule-actions.ts) — segunda barrera de base de datos, mismo
-- patrón que agency_goals (TAREA 2B/2C). Ninguna necesita SECURITY DEFINER:
-- corren con los privilegios de quien ejecuta el INSERT/UPDATE (ya
-- autorizado por RLS a intentarlo).
-- ---------------------------------------------------------------------------

-- created_by/updated_by no falsificables: en INSERT autenticado ambos se
-- fuerzan a auth.uid(); en UPDATE autenticado, created_by permanece
-- inmutable y updated_by se fuerza a auth.uid(). Bajo service_role/sin JWT
-- de usuario (auth.uid() IS NULL) no se fuerza nada, para no bloquear la
-- acción referencial ON DELETE SET NULL que Postgres ejecuta al borrar al
-- usuario responsable/creador/editor (esa acción es un UPDATE real, pero se
-- ejecuta fuera de una petición PostgREST, así que auth.uid() es NULL ahí).
CREATE OR REPLACE FUNCTION public.enforce_agency_schedule_blocks_actor_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
      NEW.updated_by := auth.uid();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := OLD.created_by;
      NEW.updated_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_schedule_blocks_enforce_actor_columns ON public.agency_schedule_blocks;
CREATE TRIGGER trg_agency_schedule_blocks_enforce_actor_columns
  BEFORE INSERT OR UPDATE ON public.agency_schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_schedule_blocks_actor_columns();

-- responsable no interno/inactivo rechazado: responsible_id NULL siempre se
-- acepta. Si no es NULL, la comprobación de "personal interno activo" SOLO
-- se dispara para una asignación NUEVA (INSERT, o UPDATE que cambia
-- responsible_id a un valor distinto del que ya tenía la fila) — así una
-- asignación histórica nunca se revalida ni se borra automáticamente solo
-- porque esa persona pase después a is_active=false; un UPDATE que deja
-- responsible_id intacto (mismo valor que OLD) nunca entra en esta rama.
CREATE OR REPLACE FUNCTION public.enforce_agency_schedule_blocks_responsible_is_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.responsible_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.responsible_id IS DISTINCT FROM OLD.responsible_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = NEW.responsible_id
        AND is_active = TRUE
        AND (platform_role IN ('internal_admin', 'super_admin') OR is_super_admin = TRUE)
    ) THEN
      RAISE EXCEPTION 'agency_schedule_blocks.responsible_id must be active platform staff (internal_admin or super_admin)'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_schedule_blocks_validate_responsible ON public.agency_schedule_blocks;
CREATE TRIGGER trg_agency_schedule_blocks_validate_responsible
  BEFORE INSERT OR UPDATE ON public.agency_schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_schedule_blocks_responsible_is_staff();

-- ---------------------------------------------------------------------------
-- RLS — únicamente personal de plataforma, en las 4 operaciones. Reutiliza
-- public.is_platform_staff() (TAREA 1B); no se define ninguna lógica de
-- autorización nueva aquí, solo se aplica la ya existente.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_schedule_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_schedule_blocks_select_staff" ON public.agency_schedule_blocks;
CREATE POLICY "agency_schedule_blocks_select_staff"
  ON public.agency_schedule_blocks FOR SELECT
  USING (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_schedule_blocks_insert_staff" ON public.agency_schedule_blocks;
CREATE POLICY "agency_schedule_blocks_insert_staff"
  ON public.agency_schedule_blocks FOR INSERT
  WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_schedule_blocks_update_staff" ON public.agency_schedule_blocks;
CREATE POLICY "agency_schedule_blocks_update_staff"
  ON public.agency_schedule_blocks FOR UPDATE
  USING (public.is_platform_staff())
  WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_schedule_blocks_delete_staff" ON public.agency_schedule_blocks;
CREATE POLICY "agency_schedule_blocks_delete_staff"
  ON public.agency_schedule_blocks FOR DELETE
  USING (public.is_platform_staff());

-- Privilegios de tabla: authenticated los necesita para que RLS pueda
-- evaluarse en absoluto. anon nunca los recibe: ni siquiera llega a evaluar
-- RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_schedule_blocks TO authenticated;
REVOKE ALL ON public.agency_schedule_blocks FROM anon;

-- El directorio de personal para el selector de responsable ya existe:
-- "users_select_staff_directory" (20260818094500_agency_goals.sql) permite
-- a cualquier personal de plataforma ver otras filas que también sean
-- personal de plataforma. No se crea ninguna tabla ni política nueva de
-- personas/responsables aquí — se reutiliza public.users tal cual.

-- ============================================================
-- End of migration: 20260820140000_agency_schedule_blocks
-- ============================================================
