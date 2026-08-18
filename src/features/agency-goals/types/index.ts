// TAREA 2 — Dirección interna, módulo de Objetivos. Datos internos de
// OnyxLink (sin workspace_id) — ver la migración 20260818094500_agency_goals.

export type GoalPeriodType = "annual" | "quarterly" | "monthly" | "weekly";
export type GoalStatus = "pending" | "in_progress" | "completed";

export const GOAL_PERIOD_TYPES: GoalPeriodType[] = ["annual", "quarterly", "monthly", "weekly"];
export const GOAL_STATUSES: GoalStatus[] = ["pending", "in_progress", "completed"];

export const GOAL_PERIOD_TYPE_LABELS: Record<GoalPeriodType, string> = {
  annual: "Anual",
  quarterly: "Trimestral",
  monthly: "Mensual",
  weekly: "Semanal",
};

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completado",
};

export interface AgencyGoalOwner {
  id: string;
  full_name: string;
}

export interface AgencyGoalRow {
  id: string;
  title: string;
  description: string | null;
  period_type: GoalPeriodType;
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  owner_id: string | null;
  status: GoalStatus;
  progress: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencyGoalWithOwner extends AgencyGoalRow {
  owner: AgencyGoalOwner | null;
}
