/**
 * task-schemas.ts — Zod validation schemas for task actions, kept in a plain
 * (non "use server") module so they can be unit-tested directly.
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

export const CreateTaskSchema = z
  .object({
    deal_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    title: z.string().min(1, "El título es requerido"),
    description: z.string().optional(),
    task_type: TaskTypeEnum.optional(),
    due_at: z.string().optional(),
    assigned_to: z.string().uuid().optional(),
  })
  .refine((d) => Boolean(d.deal_id || d.contact_id), {
    message: "Se requiere un deal o un contacto",
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
