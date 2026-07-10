-- ============================================================================
-- Une las llamadas de voz (Vapi) al mismo grafo de contactos/pipeline que
-- WhatsApp — el objetivo es una única base de datos por contacto sin
-- importar el canal. voice_calls.contact_id se resuelve por teléfono
-- (misma normalización E.164 que normalizer.ts usa para WhatsApp) en el
-- webhook, no aquí — esta migración solo abre el hueco en el esquema.
-- ============================================================================

ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voice_calls_contact ON voice_calls(contact_id);
