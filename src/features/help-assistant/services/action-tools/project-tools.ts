import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  createProject,
  updateProject,
  getProjectsForBoard,
} from "@/features/projects/services/project-actions";
import {
  createTask,
  updateTask,
  listTasks,
} from "@/features/projects/services/task-actions";
import { TaskStatusEnum, TaskTypeEnum } from "@/features/projects/services/task-schemas";
import { PROJECT_STATUSES } from "@/features/projects/types";
import { logAudit } from "@/features/audit/services/audit-log";
import type { HelpActionContext } from "../../types";

/**
 * Action tools for Proyectos (proyectos + tareas) — thin wrappers around
 * project-actions.ts / task-actions.ts. No delete tool exists here on
 * purpose — see the plan doc.
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

export function buildProjectTools(ctx: HelpActionContext) {
  return {
    search_projects: tool({
      description:
        "Busca proyectos por nombre. Úsalo antes de crear una tarea (para obtener el project_id) o antes de editar un proyecto.",
      inputSchema: zodSchema(SearchProjectsSchema),
      execute: async ({ query }: z.infer<typeof SearchProjectsSchema>) => {
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
        "Busca tareas por título, opcionalmente limitado a un proyecto. Úsalo antes de editar o completar una tarea para obtener su task_id.",
      inputSchema: zodSchema(SearchTasksSchema),
      execute: async ({ query, project_id }: z.infer<typeof SearchTasksSchema>) => {
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
        "Actualiza una tarea existente: título, descripción, tipo, fecha límite o estado (usa status:'done' para marcarla completada). Necesitas su task_id — búscalo antes con search_tasks si no lo tienes.",
      inputSchema: zodSchema(UpdateTaskSchema),
      execute: async ({ task_id, ...patch }: z.infer<typeof UpdateTaskSchema>) => {
        const result = await updateTask(task_id, patch);
        if (!result.ok) return { ok: false, error: result.error };

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
  };
}
