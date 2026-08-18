// TAREA 3 — KPI de Dirección. Datos internos de OnyxLink (sin relación con
// contactos/workspaces del producto salvo el vínculo explícito
// agency_client_relationships.workspace_id) — ver la migración
// 20260818120000_agency_kpis.

export type MeetingStatus = "scheduled" | "held" | "cancelled" | "no_show";
export type MeetingOutcome = "won" | "lost" | "pending";

export const MEETING_STATUSES: MeetingStatus[] = ["scheduled", "held", "cancelled", "no_show"];
export const MEETING_OUTCOMES: MeetingOutcome[] = ["won", "lost", "pending"];

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: "Programada",
  held: "Realizada",
  cancelled: "Cancelada",
  no_show: "No presentado",
};

export const MEETING_OUTCOME_LABELS: Record<MeetingOutcome, string> = {
  won: "Ganada",
  lost: "Perdida",
  pending: "Pendiente",
};

export interface AgencyClientRelationshipRow {
  id: string;
  // TAREA 3B: nullable — ON DELETE SET NULL cuando el workspace se borra
  // (nunca CASCADE, para conservar el histórico). client_name_snapshot es
  // el respaldo permanente del nombre para ese caso.
  workspace_id: string | null;
  client_name_snapshot: string;
  /** YYYY-MM-DD */
  service_started_on: string;
  /** YYYY-MM-DD */
  service_ended_on: string | null;
  monthly_fee: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencyClientRelationshipWithWorkspace extends AgencyClientRelationshipRow {
  workspace: { id: string; name: string } | null;
}

export interface AgencySalesMeetingRow {
  id: string;
  lead_name: string;
  /** ISO timestamp */
  scheduled_at: string;
  status: MeetingStatus;
  outcome: MeetingOutcome | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Workspace elegible para registrarse como cliente (todavía sin relación). */
export interface RegistrableWorkspace {
  id: string;
  name: string;
}
