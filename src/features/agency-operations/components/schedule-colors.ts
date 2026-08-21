import type { ScheduleColorKey } from "../types";

interface ScheduleColorStyle {
  /** Nombre visible en el selector y en aria-label. */
  label: string;
  /** Fondo + borde + texto del bloque ocupado, claro y oscuro. */
  cell: string;
  /** Punto de color del selector. */
  dot: string;
}

// TAREA 4B — paleta cerrada (SCHEDULE_COLOR_KEYS en ../types). Clases de
// Tailwind COMPLETAS y estáticas para cada una de las 6 — nunca compuestas
// por interpolación de variables (`bg-${color}-50` no lo detectaría el
// compilador de Tailwind). Funcionan en tema claro y oscuro.
export const SCHEDULE_COLOR_STYLES: Record<ScheduleColorKey, ScheduleColorStyle> = {
  teal: {
    label: "Verde azulado",
    cell: "border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-500/50 dark:bg-teal-500/15 dark:text-teal-100",
    dot: "bg-teal-500",
  },
  blue: {
    label: "Azul",
    cell: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/50 dark:bg-blue-500/15 dark:text-blue-100",
    dot: "bg-blue-500",
  },
  violet: {
    label: "Violeta",
    cell: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-500/50 dark:bg-violet-500/15 dark:text-violet-100",
    dot: "bg-violet-500",
  },
  amber: {
    label: "Ámbar",
    cell: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  rose: {
    label: "Rosa",
    cell: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/50 dark:bg-rose-500/15 dark:text-rose-100",
    dot: "bg-rose-500",
  },
  slate: {
    label: "Gris pizarra",
    cell: "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-500/50 dark:bg-slate-500/15 dark:text-slate-100",
    dot: "bg-slate-500",
  },
};
