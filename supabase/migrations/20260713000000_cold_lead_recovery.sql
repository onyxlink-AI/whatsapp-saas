-- ============================================================================
-- Recuperación de Leads Fríos con IA (opt-in, add-on facturable aparte).
-- La IA decide QUÉ contactos fríos merece la pena reenganchar y con qué
-- plantilla aprobada + qué valores personalizados — nunca redacta texto
-- libre (WhatsApp lo prohíbe fuera de la ventana de 24h, ver
-- 20260608000003_24h_guard.sql). El estado de debounce/evaluación vive en
-- contacts.custom_fields (sin migración), mismo patrón que los campos
-- lead_* del setter.
-- ============================================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS cold_lead_recovery_enabled BOOLEAN NOT NULL DEFAULT FALSE;
