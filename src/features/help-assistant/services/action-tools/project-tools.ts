import { tool, zodSchema } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  createProject,
  updateProject,
  getProjectsForBoard,
} from "@/features/projects/services/project-actions";
import {
  createTask,
  updateTask,
  listTasks,
  reassignTask,
} from "@/features/projects/services/task-actions";
import {
  createSubtask,
  updateSubtask,
  toggleSubtask,
  listSubtasks,
} from "@/features/projects/services/subtask-actions";
import { TaskStatusEnum, TaskTypeEnum } from "@/features/projects/services/task-schemas";
import { PROJECT_STATUSES } from "@/features/projects/types";
import { logAudit } from "@/features/audit/services/audit-log";
import { assertHelpActionAccess, assistantAccessErrorMessage } from "../assistant-access";
import type { HelpActionContext } from "../../types";

/**
 * Action tools for Proyectos (proyectos + tareas + subtareas) — thin
 * wrappers around project-actions.ts / task-actions.ts / subtask-actions.ts.
 * No delete tool exists here on purpose — see the plan doc.
 */

const ProjectStatusEnum = z.enum(
  PROJECT_STATUSES as [(typeof PROJECT_STATUSES)[number], ...(typeof PROJECT_STATUSES)[number][]],
);

const SearchProjectsSchema = z.object({
  query: z.string().min(1).describe("Nombre del proyecto a buscar"),
});

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  contact_id: z.string().uuid().optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  priority: z.enum(["baja", "media", "alta"]).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateProjectSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).optional(),
  status: ProjectStatusEnum.optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  priority: z.enum(["baja", "media", "alta"]).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const SearchTasksSchema = z.object({
  query: z.string().min(1).describe("Título de la tarea a buscar"),
  project_id: z.string().uuid().optional().describe("Limita la búsqueda a un proyecto concreto"),
});

const CreateTaskSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  task_type: TaskTypeEnum.optional(),
  due_at: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  task_type: TaskTypeEnum.optional(),
  due_at: z.string().optional(),
  status: TaskStatusEnum.optional(),
});

const AssignTaskSchema = z.object({
  task_id: z.string().uuid(),
  user_id: z.string().uuid().describe("Debe ser un miembro activo de esta misma empresa"),
});

const SearchSubtasksSchema = z.object({
  task_id: z.string().uuid(),
  query: z.string().optional().describe("Filtra por título; si se omite, devuelve todas las subtareas de la tarea"),
});

const CreateSubtaskSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(1),
});

const UpdateSubtaskSchema = z.object({
  subtask_id: z.string().uuid(),
  title: z.string().min(1).optional(),
  assigned_to: z.string().uuid().nullable().optional().describe("Debe ser un miembro activo de esta misma empresa, o null para desasignar"),
  due_at: z.string().nullable().optional(),
});

const CompleteSubtaskSchema = z.object({
  subtask_id: z.string().uuid(),
  done: z.boolean(),
});

export function buildProjectTools(ctx: HelpActionContext) {
  return {
    search_projects: tool({
      description:
        "Busca proyectos por nombre. Úsalo antes de crear una tarea (para obtener el project_id) o antes de editar un proyecto.",
      inputSchema: zodSchema(SearchProjectsSchema),
      execute: async ({ query }: z.infer<typeof SearchProjectsSchema>) => {
        const access = await assertHelpActionAccess(ctx, "projects");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const projects = await getProjectsForBoard(ctx.workspaceId);
        const q = query.toLowerCase();
        return projects
          .filter((p) => p.name.toLowerCase().includes(q))
          .slice(0, 10)
          .map((p) => ({ project_id: p.id, name: p.name, status: p.status }));
      },
    }),

    create_project: tool({
      description:
        "Crea un proyecto nuevo. Siempre empieza en estado 'pendiente' — usa update_project después si hace falta moverlo de columna.",
      inputSchema: zodSchema(CreateProjectSchema),
      execute: async (args: z.infer<typeof CreateProjectSchema>) => {
        const access = await assertHelpActionAccess(ctx, "projects");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await createProject(ctx.workspaceId, args);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.create_project",
          targetType: "project",
          targetId: result.data.id,
          summary: `Asistente de Ayuda creó el proyecto "${args.name}"`,
        });

        return { ok: true, project_id: result.data.id };
      },
    }),

    update_project: tool({
      description:
        "Actualiza un proyecto existente: nombre, estado (columna), prioridad, fecha límite, descripción o notas. Necesitas su project_id — búscalo antes con search_projects si no lo tienes.",
      inputSchema: zodSchema(UpdateProjectSchema),
      execute: async ({ project_id, ...patch }: z.infer<typeof UpdateProjectSchema>) => {
        const access = await assertHelpActionAccess(ctx, "projects");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await updateProject(project_id, patch);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_project",
          targetType: "project",
          targetId: project_id,
          summary: "Asistente de Ayuda actualizó un proyecto",
        });

        return { ok: true, project_id };
      },
    }),

    search_tasks: tool({
      description:
        "Busca tareas por título, opcionalmente limitado a un proyecto. Úsalo antes de editar, completar, asignar o añadir subtareas a una tarea para obtener su task_id.",
      inputSchema: zodSchema(SearchTasksSchema),
      execute: async ({ query, project_id }: z.infer<typeof SearchTasksSchema>) => {
        const access = await assertHelpActionAccess(ctx, "tasks");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const tasks = await listTasks(ctx.workspaceId, { projectId: project_id });
        const q = query.toLowerCase();
        return tasks
          .filter((t) => t.title.toLowerCase().includes(q))
          .slice(0, 10)
          .map((t) => ({ task_id: t.id, title: t.title, status: t.status, project_id: t.project_id }));
      },
    }),

    create_task: tool({
      description:
        "Crea una tarea dentro de un proyecto. Necesitas el project_id — búscalo antes con search_projects si no lo tienes.",
      inputSchema: zodSchema(CreateTaskSchema),
      execute: async (args: z.infer<typeof CreateTaskSchema>) => {
        const access = await assertHelpActionAccess(ctx, "tasks");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await createTask(ctx.workspaceId, args);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.create_task",
          targetType: "task",
          targetId: result.data.id,
          summary: `Asistente de Ayuda creó la tarea "${args.title}"`,
        });

        return { ok: true, task_id: result.data.id };
      },
    }),

    update_task: tool({
      description:
        "Actualiza una tarea existente: título, descripción, tipo, fecha límite o estado (usa status:'done' para marcarla completada). Necesitas su task_id — búscalo antes con search_tasks si no lo tienes. Para reasignar el responsable usa assign_task, no esta herramienta.",
      inputSchema: zodSchema(UpdateTaskSchema),
      execute: async ({ task_id, ...patch }: z.infer<typeof UpdateTaskSchema>) => {
        const access = await assertHelpActionAccess(ctx, "tasks");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await updateTask(ctx.workspaceId, task_id, patch);
        if (!result.ok) {
          return { ok: false, error: result.error === "not_found_or_forbidden" ? "No encontré esa tarea en esta empresa" : result.error };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_task",
          targetType: "task",
          targetId: task_id,
          summary: "Asistente de Ayuda actualizó una tarea",
        });

        return { ok: true, task_id };
      },
    }),

    assign_task: tool({
      description:
        "Asigna (o reasigna) el responsable de una tarea existente. El responsable DEBE ser un miembro activo de esta misma empresa — si no lo es, la herramienta lo rechaza. Necesitas su task_id — búscalo antes con search_tasks.",
      inputSchema: zodSchema(AssignTaskSchema),
      execute: async ({ task_id, user_id }: z.infer<typeof AssignTaskSchema>) => {
        const access = await assertHelpActionAccess(ctx, "tasks");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await reassignTask(ctx.workspaceId, task_id, user_id);
        if (!result.ok) {
          return { ok: false, error: result.error === "not_found_or_forbidden" ? "No encontré esa tarea en esta empresa" : result.error };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.assign_task",
          targetType: "task",
          targetId: task_id,
          summary: "Asistente de Ayuda reasignó una tarea",
        });

        return { ok: true, task_id };
      },
    }),

    search_subtasks: tool({
      description: "Lista o busca subtareas dentro de una tarea. Necesitas el task_id de la tarea padre — búscalo antes con search_tasks.",
      inputSchema: zodSchema(SearchSubtasksSchema),
      execute: async ({ task_id, query }: z.infer<typeof SearchSubtasksSchema>) => {
        const access = await assertHelpActionAccess(ctx, "tasks");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const subtasks = await listSubtasks(task_id);
        // Defensa adicional: listSubtasks solo filtra por task_id — se
        // descarta aquí cualquier fila que no pertenezca a este workspace
        // (p.ej. si el modelo pasara un task_id ajeno), sin depender solo de RLS.
        const scoped = subtasks.filter((s) => s.workspace_id === ctx.workspaceId);
        const q = query?.toLowerCase();
        return scoped
          .filter((s) => !q || s.title.toLowerCase().includes(q))
          .slice(0, 20)
          .map((s) => ({ subtask_id: s.id, title: s.title, done: s.done, assigned_to: s.assigned_to }));
      },
    }),

    create_subtask: tool({
      description: "Crea una subtarea dentro de una tarea existente. Necesitas el task_id — búscalo antes con search_tasks.",
      inputSchema: zodSchema(CreateSubtaskSchema),
      execute: async ({ task_id, title }: z.infer<typeof CreateSubtaskSchema>) => {
        const access = await assertHelpActionAccess(ctx, "tasks");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await createSubtask(ctx.workspaceId, { task_id, title });
        if (!result.ok) {
          return { ok: false, error: result.error === "not_found_or_forbidden" ? "No encontré esa tarea en esta empresa" : result.error };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.create_subtask",
          targetType: "subtask",
          targetId: result.data.id,
          summary: `Asistente de Ayuda creó la subtarea "${title}"`,
        });

        return { ok: true, subtask_id: result.data.id };
      },
    }),

    update_subtask: tool({
      description:
        "Actualiza una subtarea: título, responsable o fecha límite. El responsable DEBE ser un miembro activo de esta misma empresa. Necesitas su subtask_id — búscalo antes con search_subtasks.",
      inputSchema: zodSchema(UpdateSubtaskSchema),
      execute: async ({ subtask_id, ...patch }: z.infer<typeof UpdateSubtaskSchema>) => {
        const access = await assertHelpActionAccess(ctx, "tasks");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        if (patch.assigned_to) {
          const memberCheck = await assertResponsibleBelongsToWorkspace(ctx.workspaceId, patch.assigned_to);
          if (!memberCheck.ok) return { ok: false, error: memberCheck.error };
        }

        const result = await updateSubtask(ctx.workspaceId, subtask_id, patch);
        if (!result.ok) {
          return { ok: false, error: result.error === "not_found_or_forbidden" ? "No encontré esa subtarea en esta empresa" : result.error };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_subtask",
          targetType: "subtask",
          targetId: subtask_id,
          summary: "Asistente de Ayuda actualizó una subtarea",
        });

        return { ok: true, subtask_id };
      },
    }),

    complete_subtask: tool({
      description: "Marca (o desmarca) una subtarea como completada. Necesitas su subtask_id.",
      inputSchema: zodSchema(CompleteSubtaskSchema),
      execute: async ({ subtask_id, done }: z.infer<typeof CompleteSubtaskSchema>) => {
        const access = await assertHelpActionAccess(ctx, "tasks");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await toggleSubtask(ctx.workspaceId, subtask_id, done);
        if (!result.ok) {
          return { ok: false, error: result.error === "not_found_or_forbidden" ? "No encontré esa subtarea en esta empresa" : result.error };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.complete_subtask",
          targetType: "subtask",
          targetId: subtask_id,
          summary: done ? "Asistente de Ayuda completó una subtarea" : "Asistente de Ayuda desmarcó una subtarea",
        });

        return { ok: true, subtask_id };
      },
    }),
  };
}

/** Todos los responsables deben pertenecer activamente al mismo workspace — nunca solo "existir" como usuario. */
async function assertResponsibleBelongsToWorkspace(
  workspaceId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[project-tools] error comprobando membership del responsable:", error.message);
    return { ok: false, error: "No se pudo comprobar tu acceso en este momento. Inténtalo de nuevo en unos segundos." };
  }
  if (!data) {
    return { ok: false, error: "El responsable no pertenece a la empresa activa" };
  }
  return { ok: true };
}
