export type DealStage =
  | "exploracion"
  | "interes"
  | "listo_para_comprar"
  | "cliente"
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
  phone: string | null;
  email: string | null;
  stage: string | null;
}

/** A Notion-style creatable tag — typed once, reused as an option from then on. */
export interface SectorSummary {
  id: string;
  name: string;
}

export interface DealRow {
  id: string;
  workspace_id: string;
  /** Null when the deal is still just an inline lead — see lead_name/lead_phone/lead_email below. */
  contact_id: string | null;
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
  /** Inline lead identity, used until (and preserved after) the deal is promoted into a real Contact on win. */
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  lead_social: string | null;
  lead_contact_method: string | null;
  sector_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealWithContact extends DealRow {
  /** Null for a deal that's still just an inline lead (no Contact yet). */
  contact: ContactSummary | null;
  sector: SectorSummary | null;
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

/** Fixed set of what an opportunity is actually about — shown as a selector, not free text. */
export const DEAL_PRODUCTS = ["Herramienta", "Panel completo", "Oficina Virtual"] as const;
export type DealProduct = (typeof DEAL_PRODUCTS)[number];

export const DEAL_STAGES: DealStage[] = [
  "exploracion",
  "interes",
  "listo_para_comprar",
  "cliente",
  "lost",
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  exploracion: "Exploración",
  interes: "Interés",
  listo_para_comprar: "Listo para comprar",
  cliente: "Cliente",
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
