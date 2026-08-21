// TAREA 4A — Horario interno semanal de Operaciones. Datos internos de
// OnyxLink (sin workspace_id) — ver la migración
// 20260820140000_agency_schedule_blocks. Plantilla semanal recurrente
// (lunes=1 .. domingo=7, hora=0..23, una celda por hora): nunca fechas
// concretas, nunca una fila de public.tasks/public.agenda_tasks — el
// contenido de cada celda es simplemente texto libre de ESTA tabla.

export type ScheduleWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ScheduleColorKey = "teal" | "blue" | "violet" | "amber" | "rose" | "slate";

export const SCHEDULE_COLOR_KEYS: ScheduleColorKey[] = ["teal", "blue", "violet", "amber", "rose", "slate"];

export interface AgencyScheduleResponsible {
  id: string;
  full_name: string;
}

export interface AgencyScheduleBlockRow {
  id: string;
  weekday: ScheduleWeekday;
  hour: number;
  content: string;
  color_key: ScheduleColorKey;
  responsible_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencyScheduleBlockWithResponsible extends AgencyScheduleBlockRow {
  responsible: AgencyScheduleResponsible | null;
}
