-- ============================================================
-- Migration: 20260818120000_agency_kpis
-- TAREA 3 — KPI de Dirección: fuentes mínimas reales y trazables.
--
-- Dos tablas internas de OnyxLink (sin relación con datos de cliente en el
-- CRM) — DELIBERADAMENTE separadas de cualquier tabla del producto:
--
--   agency_client_relationships — qué workspace es realmente un cliente de
--   la agencia (contratado, con fecha de alta/baja y cuota), nunca inferido
--   automáticamente de workspaces ni de contactos del CRM. Solo cuenta como
--   cliente cuando un internal_admin/super_admin lo registra a mano aquí.
--
--   agency_sales_meetings — reuniones comerciales (leads), sin vínculo
--   obligatorio a un workspace, porque un lead puede no ser cliente todavía.
--
-- Mismo aislamiento que agency_goals (TAREA 2): únicamente personal de
-- plataforma (public.is_platform_staff(), TAREA 1B) puede leer o escribir;
-- un cliente, incluido un admin de workspace, no debe poder ver que estas
-- tablas existen.
-- ============================================================

-- ---------------------------------------------------------------------------
-- agency_client_relationships
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_client_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- TAREA 3B: NULLABLE + ON DELETE SET NULL (antes NOT NULL + ON DELETE
  -- CASCADE). Un admin de workspace cliente puede borrar su propio
  -- workspace (workspaces_delete_admins, foundation.sql) sin poder tocar
  -- esta tabla directamente — RLS se lo impide. Pero con CASCADE ese
  -- borrado arrastraba en cascada el histórico interno de Dirección: se
  -- perdía la retención calculada, y un cliente conseguía un borrado
  -- indirecto de un dato de Dirección que RLS por sí sola no podía evitar.
  -- Con SET NULL la relación sobrevive; client_name_snapshot conserva el
  -- nombre para siempre. UNIQUE se conserva: Postgres permite múltiples
  -- NULL bajo UNIQUE (cada NULL se trata como distinto), así que varias
  -- relaciones históricas huérfanas pueden coexistir sin chocar, mientras
  -- que un workspace_id real sigue limitado a una sola relación.
  workspace_id UUID UNIQUE REFERENCES public.workspaces(id) ON DELETE SET NULL,
  -- Nombre del workspace en el momento de registrar la relación —
  -- capturado por el trigger de más abajo, nunca por la aplicación.
  -- Deliberadamente NUNCA se vuelve a sincronizar si el workspace cambia de
  -- nombre o se borra: es un respaldo histórico congelado, no un espejo en
  -- vivo (mientras el workspace exista, la interfaz muestra su nombre
  -- actual vía el join; este campo es el respaldo para cuando ya no exista).
  client_name_snapshot TEXT NOT NULL,
  service_started_on DATE NOT NULL,
  service_ended_on DATE,
  -- NUMERIC(12,2) es un tipo decimal exacto (nunca IEEE754) — el riesgo real
  -- de coma flotante está en JavaScript, no aquí. La media de ticket medio
  -- se calcula en TypeScript convirtiendo a céntimos enteros; ver
  -- kpi-calculations.ts.
  monthly_fee NUMERIC(12,2),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_agency_client_relationships_fee_nonnegative CHECK (monthly_fee IS NULL OR monthly_fee >= 0),
  CONSTRAINT chk_agency_client_relationships_dates CHECK (service_ended_on IS NULL OR service_ended_on >= service_started_on)
);

CREATE INDEX IF NOT EXISTS idx_agency_client_relationships_dates
  ON public.agency_client_relationships (service_started_on, service_ended_on);

CREATE OR REPLACE FUNCTION public.set_agency_client_relationships_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_client_relationships_updated_at ON public.agency_client_relationships;
CREATE TRIGGER trg_agency_client_relationships_updated_at
  BEFORE UPDATE ON public.agency_client_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_agency_client_relationships_updated_at();

-- TAREA 3B — client_name_snapshot SIEMPRE se deriva de public.workspaces en
-- el momento de la inserción; nunca se confía en un valor enviado por el
-- navegador (se sobrescribe incondicionalmente cuando hay workspace_id,
-- ignorando lo que el cliente haya mandado en ese campo). Rechaza el INSERT
-- si workspace_id no corresponde a ningún workspace real (23503, mismo
-- código que una violación de FK).
--
-- Se dispara SOLO en INSERT — nunca en UPDATE — así que la acción
-- referencial ON DELETE SET NULL (que es un UPDATE, no un INSERT) nunca la
-- toca: client_name_snapshot queda intacto cuando el workspace se borra,
-- exactamente como debe conservarse el histórico.
--
-- SECURITY DEFINER deliberado: sin él, la subconsulta a public.workspaces
-- corre con los privilegios del INVOCADOR y queda sujeta a SU visibilidad
-- RLS sobre workspaces. Un actor no autorizado que intente este INSERT
-- (bloqueado igualmente por RLS más abajo) podía no ver el workspace bajo
-- su propia RLS y disparar "workspace no encontrado" (23503) ANTES de
-- llegar siquiera a la barrera real (RLS de agency_client_relationships,
-- 42501) — no es un agujero de seguridad (el INSERT se rechaza en ambos
-- casos), pero enmascaraba el motivo real del rechazo con un código
-- confuso. Con SECURITY DEFINER, la resolución del nombre es siempre la
-- real y autoritativa, y la RLS de agency_client_relationships (la barrera
-- que de verdad importa) es quien decide con un código predecible.
-- Privilegios mínimos: solo SELECT sobre workspaces.name, sin exponer una
-- RPC pública (esto es un trigger, no invocable directamente) — search_path
-- vacío y nombres cualificados, mismo patrón que is_platform_staff().
CREATE OR REPLACE FUNCTION public.set_agency_client_relationships_name_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_name TEXT;
BEGIN
  IF NEW.workspace_id IS NOT NULL THEN
    SELECT name INTO resolved_name FROM public.workspaces WHERE id = NEW.workspace_id;
    IF resolved_name IS NULL THEN
      RAISE EXCEPTION 'agency_client_relationships: workspace_id % not found', NEW.workspace_id
        USING ERRCODE = '23503';
    END IF;
    NEW.client_name_snapshot := resolved_name;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_agency_client_relationships_name_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_agency_client_relationships_name_snapshot() TO authenticated;

DROP TRIGGER IF EXISTS trg_agency_client_relationships_name_snapshot ON public.agency_client_relationships;
CREATE TRIGGER trg_agency_client_relationships_name_snapshot
  BEFORE INSERT ON public.agency_client_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_agency_client_relationships_name_snapshot();

-- created_by no falsificable — mismo patrón validado en agency_goals
-- (TAREA 2B/2C): en INSERT se fuerza a auth.uid() solo cuando la sesión es
-- un usuario real; en UPDATE la inmutabilidad se aplica únicamente cuando
-- auth.uid() IS NOT NULL, para no bloquear el UPDATE interno que dispara
-- "created_by REFERENCES public.users(id) ON DELETE SET NULL" al borrar al
-- usuario creador (esa acción referencial corre sin JWT de PostgREST, igual
-- que service_role).
CREATE OR REPLACE FUNCTION public.enforce_agency_client_relationships_created_by()
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

DROP TRIGGER IF EXISTS trg_agency_client_relationships_enforce_created_by ON public.agency_client_relationships;
CREATE TRIGGER trg_agency_client_relationships_enforce_created_by
  BEFORE INSERT OR UPDATE ON public.agency_client_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_client_relationships_created_by();

ALTER TABLE public.agency_client_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_client_relationships_select_staff" ON public.agency_client_relationships;
CREATE POLICY "agency_client_relationships_select_staff"
  ON public.agency_client_relationships FOR SELECT
  USING (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_client_relationships_insert_staff" ON public.agency_client_relationships;
CREATE POLICY "agency_client_relationships_insert_staff"
  ON public.agency_client_relationships FOR INSERT
  WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_client_relationships_update_staff" ON public.agency_client_relationships;
CREATE POLICY "agency_client_relationships_update_staff"
  ON public.agency_client_relationships FOR UPDATE
  USING (public.is_platform_staff())
  WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_client_relationships_delete_staff" ON public.agency_client_relationships;
CREATE POLICY "agency_client_relationships_delete_staff"
  ON public.agency_client_relationships FOR DELETE
  USING (public.is_platform_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_client_relationships TO authenticated;
REVOKE ALL ON public.agency_client_relationships FROM anon;

-- ---------------------------------------------------------------------------
-- agency_sales_meetings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_sales_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_name TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  outcome TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_agency_sales_meetings_lead_name_not_blank CHECK (btrim(lead_name) <> ''),
  CONSTRAINT chk_agency_sales_meetings_status CHECK (status IN ('scheduled', 'held', 'cancelled', 'no_show')),
  -- Regla de integridad de negocio: scheduled/cancelled/no_show nunca llevan
  -- resultado; held siempre debe llevar uno de los 3 resultados válidos. Esta
  -- única constraint ya delimita el dominio completo de outcome — no hace
  -- falta una CHECK de dominio aparte.
  --
  -- "outcome IS NOT NULL AND" es obligatorio en la rama held: sin él,
  -- "outcome IN (...)" con outcome=NULL evalúa a NULL (no a FALSE) en SQL, y
  -- una CHECK constraint deja pasar cualquier expresión que dé NULL — así
  -- que "held" con outcome sin informar se colaba silenciosamente.
  CONSTRAINT chk_agency_sales_meetings_status_outcome CHECK (
    (status IN ('scheduled', 'cancelled', 'no_show') AND outcome IS NULL)
    OR (status = 'held' AND outcome IS NOT NULL AND outcome IN ('won', 'lost', 'pending'))
  )
);

CREATE INDEX IF NOT EXISTS idx_agency_sales_meetings_status_outcome
  ON public.agency_sales_meetings (status, outcome);
CREATE INDEX IF NOT EXISTS idx_agency_sales_meetings_scheduled_at
  ON public.agency_sales_meetings (scheduled_at);

CREATE OR REPLACE FUNCTION public.set_agency_sales_meetings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_sales_meetings_updated_at ON public.agency_sales_meetings;
CREATE TRIGGER trg_agency_sales_meetings_updated_at
  BEFORE UPDATE ON public.agency_sales_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_agency_sales_meetings_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_agency_sales_meetings_created_by()
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

DROP TRIGGER IF EXISTS trg_agency_sales_meetings_enforce_created_by ON public.agency_sales_meetings;
CREATE TRIGGER trg_agency_sales_meetings_enforce_created_by
  BEFORE INSERT OR UPDATE ON public.agency_sales_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agency_sales_meetings_created_by();

ALTER TABLE public.agency_sales_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_sales_meetings_select_staff" ON public.agency_sales_meetings;
CREATE POLICY "agency_sales_meetings_select_staff"
  ON public.agency_sales_meetings FOR SELECT
  USING (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_sales_meetings_insert_staff" ON public.agency_sales_meetings;
CREATE POLICY "agency_sales_meetings_insert_staff"
  ON public.agency_sales_meetings FOR INSERT
  WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_sales_meetings_update_staff" ON public.agency_sales_meetings;
CREATE POLICY "agency_sales_meetings_update_staff"
  ON public.agency_sales_meetings FOR UPDATE
  USING (public.is_platform_staff())
  WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS "agency_sales_meetings_delete_staff" ON public.agency_sales_meetings;
CREATE POLICY "agency_sales_meetings_delete_staff"
  ON public.agency_sales_meetings FOR DELETE
  USING (public.is_platform_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_sales_meetings TO authenticated;
REVOKE ALL ON public.agency_sales_meetings FROM anon;

-- ---------------------------------------------------------------------------
-- workspaces — visibilidad estrecha adicional para el selector de clientes.
--
-- workspaces_select_members (20260608000000_foundation.sql) solo deja ver a
-- un usuario los workspaces de los que es miembro; un internal_admin
-- normalmente no pertenece a ninguno, así que no vería ningún nombre para
-- elegir en el selector "registrar cliente". Esta política SELECT adicional
-- se combina por OR con la existente (nunca la sustituye) — únicamente
-- amplía LECTURA para personal de plataforma. INSERT/UPDATE/DELETE de
-- workspaces siguen exactamente como estaban (workspaces_update_admins,
-- workspaces_delete_admins, sin política de INSERT ampliada aquí).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "workspaces_select_staff_directory" ON public.workspaces;
CREATE POLICY "workspaces_select_staff_directory"
  ON public.workspaces FOR SELECT
  USING (public.is_platform_staff());

-- ============================================================
-- End of migration: 20260818120000_agency_kpis
-- ============================================================
