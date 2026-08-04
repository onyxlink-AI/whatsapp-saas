/**
 * task-schemas.ts — Zod validation schemas for the Proyectos "Tareas" tab.
 * Kept in a plain (non "use server") module so they can be unit-tested
 * directly, mirroring pipeline's task-schemas.ts.
 */

import { z } from "zod";

export const TaskStatusEnum = z.enum(["pending", "in_progress", "done", "cancelled"]);
export const TaskTypeEnum = z.enum([
  "call",
  "whatsapp_followup",
  "email",
  "meeting",
  "follow_up",
  "other",
  "deep_work",
  "content_creation",
]);

// Fase 2 del roadmap comercial: una tarea de Gestión ya no necesita un
// proyecto — puede vivir suelta y asociarse/desasociarse después.
export const CreateTaskSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  task_type: TaskTypeEnum.optional(),
  due_at: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  task_type: TaskTypeEnum.optional(),
  due_at: z.string().optional(),
  status: TaskStatusEnum.optional(),
  // Asociar/desasociar de un proyecto — null desasocia explícitamente.
  project_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

// Creación en lote — una fila por tarea, con valores comunes ya resueltos
// por la UI (proyecto/responsable/tipo/fecha comunes opcionales) antes de
// llamar al server action, así cada fila es autosuficiente y validable de
// forma independiente.
export const BatchTaskRowSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  project_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  task_type: TaskTypeEnum.optional(),
  due_at: z.string().optional(),
});

export type BatchTaskRow = z.infer<typeof BatchTaskRowSchema>;
