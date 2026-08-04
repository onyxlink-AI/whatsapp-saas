-- ============================================================
-- Migration: 20260806000001_tasks_subtasks_phase2
-- Fase 2 del roadmap comercial:
--   1. Las tareas de Gestión pueden existir sueltas, sin proyecto ni trato
--      ni contacto — se relaja chk_tasks_has_owner_entity (dropear un CHECK
--      nunca rompe filas existentes, solo deja de exigir un ancla).
--   2. Dos tipos de tarea nuevos: Deep Work y Crear contenido. Se conservan
--      todos los tipos actuales (call/whatsapp_followup/email/meeting/
--      follow_up/other) — solo se AMPLÍA el CHECK, no se quita ningún valor.
--   3. Subtareas ganan responsable y fecha opcionales, para poder actuar de
--      checklist operativo real dentro de una tarea.
-- ============================================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_has_owner_entity;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check
  CHECK (task_type IN (
    'call', 'whatsapp_followup', 'email', 'meeting', 'follow_up', 'other',
    'deep_work', 'content_creation'
  ));

ALTER TABLE subtasks
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE subtasks
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subtasks_assigned ON subtasks(workspace_id, assigned_to);

-- ============================================================
-- End of migration: 20260806000001_tasks_subtasks_phase2
-- ============================================================
