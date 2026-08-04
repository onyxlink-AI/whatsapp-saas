-- ============================================================
-- Migration: 20260805000000_whatsapp_requires_gestion
-- Fase 1 del roadmap comercial: el Agente de WhatsApp pasa a incluir
-- siempre Onyxlink Gestión (Paquete 2 = Paquete 1 + WhatsApp). Esto
-- REVIERTE la decisión de 20260713000500_gestion_enabled, que dejó
-- Gestión y WhatsApp como productos explícitamente independientes — ese
-- fue el modelo correcto hasta ahora; el roadmap de 3 fases lo cambia a
-- propósito.
--
-- whatsapp_agent_enabled es NOT NULL DEFAULT true y gestion_enabled es
-- NOT NULL DEFAULT false (ambas desde 20260713000500) — es decir, CUALQUIER
-- workspace que nunca haya tocado gestion_enabled ya está, por defecto, en
-- el estado que este paquete ahora prohíbe (whatsapp=true, gestion=false).
-- Validar el CHECK contra esas filas existentes rompería la migración (y
-- tocar datos remotos para "corregirlas" está fuera de alcance de la Fase
-- 1). Por eso el constraint se añade con NOT VALID: se aplica a partir de
-- ahora a todo INSERT/UPDATE nuevo (incluida la activación atómica desde
-- los endpoints de Ajustes), pero no exige que las filas ya existentes
-- cumplan retroactivamente. Validarlo de verdad (ALTER TABLE ... VALIDATE
-- CONSTRAINT) requiere primero auditar y corregir los workspaces de
-- producción que hoy incumplen — trabajo explícitamente fuera de la Fase 1.
-- ============================================================

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_whatsapp_requires_gestion;
ALTER TABLE workspaces
  ADD CONSTRAINT chk_whatsapp_requires_gestion
  CHECK (whatsapp_agent_enabled = false OR gestion_enabled = true)
  NOT VALID;

-- ============================================================
-- End of migration: 20260805000000_whatsapp_requires_gestion
-- ============================================================
