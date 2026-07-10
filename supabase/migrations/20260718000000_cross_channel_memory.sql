-- ============================================================================
-- Memoria compartida entre canales (voz + WhatsApp) — flag independiente de
-- advanced_memory_enabled y vapi_assistant_id. Permite vender/activar
-- Memoria Inteligente Avanzada y el Asistente de voz por separado, sin que
-- las llamadas alimenten automáticamente la memoria compartida a menos que
-- esto también esté activo. Solo Onyxlink puede activarlo (super admin,
-- igual que los demás add-ons).
-- ============================================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS cross_channel_memory_enabled BOOLEAN NOT NULL DEFAULT FALSE;
