-- ============================================================================
-- Recordatorios automáticos de citas (2h antes). No es un add-on de IA — es
-- una automatización determinista: si hay una cita agendada y una plantilla
-- de WhatsApp aprobada, se manda el recordatorio. No necesita flag nuevo de
-- workspace, se activa solo cuando ambas condiciones se cumplen.
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
