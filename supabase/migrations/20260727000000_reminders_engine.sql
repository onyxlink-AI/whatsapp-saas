-- ============================================================================
-- Migration: 20260727000000_reminders_engine
-- Agente WhatsApp — Recordatorios y seguimiento (motor determinista, reutilizable)
--
-- Un cliente configura una secuencia de pasos ligados a una cita real
-- (Google Calendar / HighLevel, las únicas fuentes de citas que ya existen —
-- ver schedule-google.ts / schedule-highlevel.ts). El SISTEMA calcula cuándo
-- corresponde cada envío (nunca la IA); la IA solo personaliza el contenido y
-- responde al cliente cuando este contesta. "Estudio de tatuajes" es la
-- primera plantilla sectorial (código, no fila de BD) que se "instala" como
-- reminder_steps editables — el motor en sí es agnóstico de sector.
--
-- No duplica `appointments` (ya existe, con workspace_id/contact_id/
-- conversation_id/scheduled_at/status) — reminder_jobs solo referencia esa
-- tabla. Tampoco duplica el envío (reutiliza dispatch.ts) ni las plantillas
-- de WhatsApp (reutiliza templates.ts / template-actions.ts).
--
-- Convenciones seguidas del resto del repo: CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, DROP TRIGGER IF EXISTS + CREATE TRIGGER,
-- auth_workspace_ids()/auth_has_role() para RLS (patrón "agents": select
-- cualquier miembro, escritura admin/manager — este es autoservicio del
-- cliente, no un add-on exclusivo de Onyxlink).
-- ============================================================================

-- ============================================================
-- Table: reminder_configs (1 fila por workspace)
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  template_key TEXT NOT NULL DEFAULT 'custom',
  template_version INT NOT NULL DEFAULT 1,
  -- Solo integraciones reales existentes; NULL = todavía sin elegir.
  appointment_source TEXT CHECK (appointment_source IS NULL OR appointment_source IN ('google_calendar', 'highlevel')),
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  -- Minutos desde medianoche (hora local del workspace); evita lidiar con el
  -- tipo TIME + DST en SQL — el cálculo real ocurre en JS vía Intl (scheduling.ts).
  send_window_start_minute SMALLINT NOT NULL DEFAULT 540 CHECK (send_window_start_minute BETWEEN 0 AND 1439), -- 09:00
  send_window_end_minute SMALLINT NOT NULL DEFAULT 1200 CHECK (send_window_end_minute BETWEEN 0 AND 1439),   -- 20:00
  allow_ai_personalization BOOLEAN NOT NULL DEFAULT TRUE,
  -- Palabras/frases que, si aparecen en una respuesta del cliente, fuerzan
  -- escalado humano + pausan la secuencia (dolor intenso, pus, fiebre, etc.).
  -- Configurable por negocio — ver decide() en decision-engine.ts.
  sensitive_keywords TEXT[] NOT NULL DEFAULT '{}',
  sensitive_response_message TEXT,
  -- Cita marcada como no-presentada: por defecto NO recibe pasos posteriores
  -- (cuidados/seguimiento), salvo que el negocio lo active explícitamente.
  continue_after_no_show BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

DROP TRIGGER IF EXISTS trg_reminder_configs_updated_at ON reminder_configs;
CREATE TRIGGER trg_reminder_configs_updated_at
  BEFORE UPDATE ON reminder_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reminder_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminder_configs_select"
  ON reminder_configs FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "reminder_configs_write"
  ON reminder_configs FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ============================================================
-- Table: reminder_steps (pasos editables de la secuencia instalada)
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  position SMALLINT NOT NULL DEFAULT 0,
  -- Minutos relativos a appointments.scheduled_at; negativo = antes, positivo = después.
  offset_minutes INT NOT NULL,
  message_base TEXT NOT NULL DEFAULT '',
  allow_ai_personalize BOOLEAN NOT NULL DEFAULT TRUE,
  -- Paso 4 ("solicitar valoración"): solo se ejecuta si el negocio lo activa aquí.
  requires_consent BOOLEAN NOT NULL DEFAULT FALSE,
  -- Si es true, el paso espera y registra una respuesta del cliente
  -- (confirmar/cambiar/cancelar en el recordatorio, evolución en el seguimiento).
  collects_response BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id, step_key)
);
CREATE INDEX IF NOT EXISTS idx_reminder_steps_workspace ON reminder_steps(workspace_id, position);

DROP TRIGGER IF EXISTS trg_reminder_steps_updated_at ON reminder_steps;
CREATE TRIGGER trg_reminder_steps_updated_at
  BEFORE UPDATE ON reminder_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reminder_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminder_steps_select"
  ON reminder_steps FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "reminder_steps_write"
  ON reminder_steps FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ============================================================
-- Table: reminder_jobs (una fila por cita × paso — el envío programado real)
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  step_id UUID REFERENCES reminder_steps(id) ON DELETE SET NULL,
  -- Copia del step_key en el momento de programar: sobrevive si el paso se
  -- borra/renombra después, para que el historial siga siendo legible.
  step_key TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'processing', 'sent', 'responded', 'cancelled', 'error', 'needs_attention')),
  attempts SMALLINT NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  cancel_reason TEXT,
  error_detail TEXT,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_jobs_due ON reminder_jobs(status, scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_reminder_jobs_appointment ON reminder_jobs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_reminder_jobs_workspace ON reminder_jobs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_reminder_jobs_contact ON reminder_jobs(contact_id);

-- Al menos un job "activo" por cita+paso: una reprogramación cancela el
-- anterior antes de crear el nuevo (ver job-scheduling.ts), así que esto es
-- una defensa en profundidad contra duplicados, no el mecanismo principal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_jobs_active_step
  ON reminder_jobs(appointment_id, step_key)
  WHERE status NOT IN ('cancelled');

DROP TRIGGER IF EXISTS trg_reminder_jobs_updated_at ON reminder_jobs;
CREATE TRIGGER trg_reminder_jobs_updated_at
  BEFORE UPDATE ON reminder_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reminder_jobs ENABLE ROW LEVEL SECURITY;

-- Historial visible para cualquier miembro del workspace (pantalla "Historial
-- de mensajes"); la escritura la hace solo el motor (service role) — igual
-- que message_batches, esto es una cola interna, no un formulario del cliente.
CREATE POLICY "reminder_jobs_select"
  ON reminder_jobs FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

-- ============================================================
-- RPC: claim_due_reminder_jobs — reclamo atómico concurrency-safe
-- (mismo patrón que claim_next_batch() en 20260608000002_buffer_rpc.sql)
-- ============================================================
CREATE OR REPLACE FUNCTION claim_due_reminder_jobs(p_limit INT DEFAULT 20)
RETURNS SETOF reminder_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id FROM public.reminder_jobs
    WHERE
      (status = 'scheduled' AND scheduled_for <= NOW())
      -- Reclama jobs "processing" atascados (worker murió a mitad de envío).
      OR (status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes')
    ORDER BY scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.reminder_jobs
  SET status = 'processing', updated_at = NOW()
  FROM candidate
  WHERE public.reminder_jobs.id = candidate.id
  RETURNING public.reminder_jobs.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_due_reminder_jobs(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_due_reminder_jobs(INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_due_reminder_jobs(INT) TO service_role;
