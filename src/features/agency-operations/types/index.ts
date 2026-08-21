// TAREA 4A — Horario interno semanal de Operaciones. Datos internos de
// OnyxLink (sin workspace_id) — ver la migración
// 20260820140000_agency_schedule_blocks. Plantilla semanal recurrente
// (lunes=1 .. domingo=7, hora=0..23, una celda por hora): nunca fechas
// concretas, nunca una fila de public.tasks/public.agenda_tasks — el
// contenido de cada celda es simplemente texto libre de ESTA tabla.

export type ScheduleWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ScheduleColorKey = "teal" | "blue" | "violet" | "amber" | "rose" | "slate";

export const SCHEDULE_COLOR_KEYS: ScheduleColorKey[] = ["teal", "blue", "violet", "amber", "rose", "slate"];

// TAREA 4B — constantes de UI para la cuadrícula/formulario. weekday=1 es
// lunes, weekday=7 es domingo (mismo orden que exige la migración).
export const SCHEDULE_WEEKDAYS: ScheduleWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export const SCHEDULE_WEEKDAY_LABELS: Record<ScheduleWeekday, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

// 0..23 — hour=23 representa 23:00-00:00, igual que documenta la migración.
export const SCHEDULE_HOURS: number[] = Array.from({ length: 24 }, (_, i) => i);

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

// TAREA 4B.1 — estado REAL del directorio de responsables (listScheduleResponsibles),
// pasado explícitamente de OperationsBoard a ScheduleFormSheet en vez de una
// lista desnuda: el formulario necesita distinguir "todavía no sabemos"
// (loading/error) de "ya sabemos que no está" (ready) para no afirmar que un
// responsable ausente está inactivo cuando en realidad el directorio nunca
// llegó a cargar.
export type ResponsiblesDirectoryState =
  | { status: "loading" }
  | { status: "ready"; responsibles: AgencyScheduleResponsible[] }
  | { status: "error"; error: string };
