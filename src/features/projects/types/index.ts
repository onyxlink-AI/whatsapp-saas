export type ProjectStatus =
  | "pendiente"
  | "en_preparacion"
  | "en_proceso"
  | "en_revision"
  | "finalizado";

export type ProjectPriority = "baja" | "media" | "alta";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "pendiente",
  "en_preparacion",
  "en_proceso",
  "en_revision",
  "finalizado",
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  pendiente: "Pendiente",
  en_preparacion: "En preparación",
  en_proceso: "En proceso",
  en_revision: "En revisión",
  finalizado: "Finalizado",
};

export const PROJECT_PRIORITIES: ProjectPriority[] = ["baja", "media", "alta"];

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

/** Minimal contact projection owned by this feature — no import from `clients`/`inbox`. */
export interface ContactOption {
  id: string;
  name: string | null;
  phone: string;
}

export interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  contact_id: string | null;
  responsible_id: string | null;
  due_date: string | null;
  priority: ProjectPriority;
  description: string | null;
  notes: string | null;
  status: ProjectStatus;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithContact extends ProjectRow {
  contact: ContactOption | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Agenda (day/week task planner + read-only Google Calendar sync), moved here
// from the old top-level `agenda` feature — now presented as a Proyectos tab.
// ──────────────────────────────────────────────────────────────────────────────

export type AgendaScheduleMode = "day" | "week";

export interface AgendaTaskRow {
  id: string;
  workspace_id: string;
  title: string;
  notes: string | null;
  scheduled_date: string | null;
  scheduled_week_start: string | null;
  /** "HH:MM:SS" (Postgres TIME), null when the task has no specific time. */
  start_time: string | null;
  end_time: string | null;
  /** Google Calendar event id when this task was also synced there, else null. */
  google_event_id: string | null;
  /** Google Meet link generated alongside the synced Calendar event, else null. */
  meeting_link: string | null;
  done: boolean;
  assigned_to: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleCalendarEventView {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tareas (moved here from Clientes — a task now hangs off a project instead
// of a contact) + subtareas (a simple checklist under a task).
// ──────────────────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export type TaskType =
  | "call"
  | "whatsapp_followup"
  | "email"
  | "meeting"
  | "follow_up"
  | "other";

export interface TaskRow {
  id: string;
  workspace_id: string;
  deal_id: string | null;
  contact_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  status: TaskStatus;
  due_at: string | null;
  assigned_to: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  done: "Completada",
  cancelled: "Cancelada",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call: "Llamada",
  whatsapp_followup: "Seguimiento WhatsApp",
  email: "Email",
  meeting: "Reunión",
  follow_up: "Seguimiento",
  other: "Otro",
};

/** Minimal project projection for the flat Tareas tab's project picker. */
export interface ProjectOption {
  id: string;
  name: string;
}

export interface SubtaskRow {
  id: string;
  workspace_id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}
