export type DealStage =
  | "new"
  | "contacted"
  | "proposal_sent"
  | "negotiation"
  | "won"
  | "lost";

export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export type TaskType =
  | "call"
  | "whatsapp_followup"
  | "email"
  | "meeting"
  | "follow_up"
  | "other";

/** Minimal contact projection owned by this feature — no import from `inbox`. */
export interface ContactSummary {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  stage: string | null;
}

export interface DealRow {
  id: string;
  workspace_id: string;
  contact_id: string;
  title: string;
  stage: DealStage;
  value: number;
  currency: string;
  owner_id: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  position: number;
  notes: string | null;
  source: string | null;
  ai_suggested_stage: DealStage | null;
  ai_suggested_reason: string | null;
  ai_suggested_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealWithContact extends DealRow {
  contact: ContactSummary;
  open_task_count: number;
}

export interface TaskRow {
  id: string;
  workspace_id: string;
  deal_id: string | null;
  contact_id: string | null;
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

export const DEAL_STAGES: DealStage[] = [
  "new",
  "contacted",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  proposal_sent: "Propuesta enviada",
  negotiation: "Negociación",
  won: "Ganado",
  lost: "Perdido",
};

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
