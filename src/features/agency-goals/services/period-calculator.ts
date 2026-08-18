// period-calculator.ts — límites de periodo deterministas para Objetivos.
//
// Principio de diseño: el servidor nunca confía en period_start/period_end
// enviados directamente por el navegador. En su lugar, el cliente manda una
// descripción MÍNIMA y semántica del periodo que quiere (un año, un
// año+trimestre, un año+mes, o una fecha cualquiera dentro de la semana
// deseada) y esta capa RECALCULA los límites exactos a partir de esa
// descripción — nunca al revés. Así una fecha manipulada no puede producir
// un periodo con límites incoherentes: cualquier entrada válida siempre cae
// dentro de un cubo canónico (el año/trimestre/mes/semana que le
// corresponde), nunca "casi" uno.
//
// Pura y sin I/O — se usa igual desde goal-schemas.ts/goal-actions.ts
// (servidor) y es trivialmente comprobable en pruebas unitarias.

import { startOfQuarter, endOfQuarter, startOfMonth, endOfMonth, startOfWeek, endOfWeek, format } from "date-fns";
import type { GoalPeriodType } from "../types";

export interface PeriodBounds {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
}

/** Formatea una Date como YYYY-MM-DD usando sus componentes LOCALES (date-fns `format`, no `toISOString`, que usa UTC y puede desfasar el día según la zona horaria del dispositivo). */
export function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** YYYY-MM-DD de "hoy" en la zona horaria local del dispositivo — ver toIsoDate. */
export function todayLocalIso(): string {
  return toIsoDate(new Date());
}

/** Construye una Date en horario LOCAL a partir de un string YYYY-MM-DD — evita el desfase de un día de `new Date("YYYY-MM-DD")`, que parsea como medianoche UTC. */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function getAnnualPeriod(year: number): PeriodBounds {
  return { start: toIsoDate(new Date(year, 0, 1)), end: toIsoDate(new Date(year, 11, 31)) };
}

export type Quarter = 1 | 2 | 3 | 4;

export function getQuarterlyPeriod(year: number, quarter: Quarter): PeriodBounds {
  const anchor = new Date(year, (quarter - 1) * 3, 1);
  return { start: toIsoDate(startOfQuarter(anchor)), end: toIsoDate(endOfQuarter(anchor)) };
}

/** month: 1-12 */
export function getMonthlyPeriod(year: number, month: number): PeriodBounds {
  const anchor = new Date(year, month - 1, 1);
  return { start: toIsoDate(startOfMonth(anchor)), end: toIsoDate(endOfMonth(anchor)) };
}

/**
 * Lunes a domingo de la semana que contiene `referenceDate` — cualquier
 * fecha dentro de esa semana (incluida una que cruce de un año al
 * siguiente) produce exactamente los mismos límites.
 */
export function getWeeklyPeriod(referenceDate: Date): PeriodBounds {
  return {
    start: toIsoDate(startOfWeek(referenceDate, { weekStartsOn: 1 })),
    end: toIsoDate(endOfWeek(referenceDate, { weekStartsOn: 1 })),
  };
}

export type PeriodSelector =
  | { type: "annual"; year: number }
  | { type: "quarterly"; year: number; quarter: Quarter }
  | { type: "monthly"; year: number; month: number }
  | { type: "weekly"; referenceDate: string };

/**
 * Única puerta de entrada real: recibe la selección semántica del cliente
 * (nunca fechas exactas) y devuelve los límites canónicos correspondientes.
 * `goal-actions.ts` (servidor) es el único llamador — el period_type y las
 * fechas que terminan en la base de datos SIEMPRE vienen de aquí.
 */
export function resolvePeriodBounds(selector: PeriodSelector): PeriodBounds {
  switch (selector.type) {
    case "annual":
      return getAnnualPeriod(selector.year);
    case "quarterly":
      return getQuarterlyPeriod(selector.year, selector.quarter);
    case "monthly":
      return getMonthlyPeriod(selector.year, selector.month);
    case "weekly":
      return getWeeklyPeriod(parseIsoDate(selector.referenceDate));
  }
}

export function periodTypeFromSelector(selector: PeriodSelector): GoalPeriodType {
  return selector.type;
}
