-- ============================================================
-- Migration: 20260806000003_project_progress_view
-- Fase 2 del roadmap comercial: fórmula determinista de progreso de un
-- proyecto, calculada en un único lugar (esta vista) en vez de duplicarla
-- en cada componente cliente.
--
-- Fórmula: progreso% = 100 * (tareas completadas + subtareas completadas)
--          / (total de tareas + total de subtareas), redondeado al entero
--          más cercano. Un proyecto sin tareas ni subtareas muestra 0%, no
--          división por cero ni 100% falso.
--
-- Es una vista normal (no materializada, no SECURITY DEFINER): PostgREST la
-- consulta siempre como el rol `authenticated`, así que las políticas RLS de
-- `projects`/`tasks`/`subtasks` se siguen aplicando tal cual sobre las
-- filas subyacentes — la vista no abre ninguna puerta nueva de acceso, solo
-- agrega el cálculo.
-- ============================================================

CREATE OR REPLACE VIEW project_progress AS
SELECT
  p.id AS project_id,
  p.workspace_id,
  COUNT(DISTINCT t.id) AS task_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'done') AS task_done_count,
  COUNT(DISTINCT s.id) AS subtask_count,
  COUNT(DISTINCT s.id) FILTER (WHERE s.done) AS subtask_done_count,
  CASE
    WHEN COUNT(DISTINCT t.id) + COUNT(DISTINCT s.id) = 0 THEN 0
    ELSE ROUND(
      100.0 * (
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'done')
        + COUNT(DISTINCT s.id) FILTER (WHERE s.done)
      ) / (COUNT(DISTINCT t.id) + COUNT(DISTINCT s.id))
    )
  END AS progress_pct
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
LEFT JOIN subtasks s ON s.task_id = t.id
GROUP BY p.id, p.workspace_id;

-- ============================================================
-- End of migration: 20260806000003_project_progress_view
-- ============================================================
