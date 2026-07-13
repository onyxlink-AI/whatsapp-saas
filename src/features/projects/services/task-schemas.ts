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
]);

export const CreateTaskSchema = z.object({
  project_id: z.string().uuid(),
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
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
