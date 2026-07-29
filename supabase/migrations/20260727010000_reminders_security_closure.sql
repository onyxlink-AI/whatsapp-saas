-- ============================================================================
-- Migration: 20260727010000_reminders_security_closure
-- Agente WhatsApp — Recordatorios: cierre de seguridad para trabajo local
--
-- Añade lo mínimo necesario para que sea estructuralmente imposible enviar un
-- WhatsApp real por accidente mientras seguimos desarrollando en local:
--   - reminder_configs: pausa por workspace, tope diario y separación mínima
--     por contacto (el interruptor global de envíos y la lista blanca de
--     teléfonos son variables de entorno, no filas de BD — ver
--     live-sending-guard.ts — así nunca son visibles desde el navegador).
--   - reminder_steps / reminder_jobs: categoría de consentimiento (para poder
--     exigir consentimiento explícito por categoría, no solo contacts.opt_in).
--   - reminder_consents (nueva): consentimiento granular por workspace +
--     contacto + categoría, con historial (nunca se borra al retirar).
--   - reminder_contact_pauses (nueva): pausa por contacto, independiente de
--     la cancelación de una cita concreta.
--
-- No duplica appointments/contacts/reminder_jobs — solo las extiende.
-- ============================================================================

-- ============================================================
-- reminder_configs: pausa de workspace + límites de contacto
-- ============================================================
ALTER TABLE reminder_configs
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS max_messages_per_contact_per_day SMALLINT NOT NULL DEFAULT 3 CHECK (max_messages_per_contact_per_day > 0),
  ADD COLUMN IF NOT EXISTS min_minutes_between_messages SMALLINT NOT NULL DEFAULT 60 CHECK (min_minutes_between_messages >= 0);

-- ============================================================
-- reminder_steps: categoría de consentimiento por paso
-- ============================================================
ALTER TABLE reminder_steps
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'appointment_reminders'
    CHECK (category IN ('appointment_reminders', 'aftercare_followup', 'review_request'));

-- ============================================================
-- reminder_jobs: categoría (copiada del paso al programar — sobrevive si el
-- paso cambia después, mismo motivo que step_key ya se snapshotea)
-- ============================================================
ALTER TABLE reminder_jobs
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'appointment_reminders'
    CHECK (category IN ('appointment_reminders', 'aftercare_followup', 'review_request'));

-- ============================================================
-- Table: reminder_consents — consentimiento granular, aislado por empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('appointment_reminders', 'aftercare_followup', 'review_request')),
  status TEXT NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'withdrawn')),
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  -- Cómo se obtuvo (ej. "whatsapp_reply", "manual_staff", "web_form") — texto
  -- libre corto, nunca contenido sensible ni el mensaje completo del cliente.
  method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id, contact_id, category)
);
CREATE INDEX IF NOT EXISTS idx_reminder_consents_contact ON reminder_consents(workspace_id, contact_id);

DROP TRIGGER IF EXISTS trg_reminder_consents_updated_at ON reminder_consents;
CREATE TRIGGER trg_reminder_consents_updated_at
  BEFORE UPDATE ON reminder_consents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reminder_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminder_consents_select"
  ON reminder_consents FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "reminder_consents_write"
  ON reminder_consents FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ============================================================
-- Table: reminder_contact_pauses — pausa por contacto (independiente de
-- cancelar una cita concreta), aislada por empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_contact_pauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id, contact_id)
);

ALTER TABLE reminder_contact_pauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminder_contact_pauses_select"
  ON reminder_contact_pauses FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "reminder_contact_pauses_write"
  ON reminder_contact_pauses FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );
