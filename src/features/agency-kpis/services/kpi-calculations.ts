// kpi-calculations.ts — fórmulas puras de los 4 KPI de Dirección. Única
// fuente de verdad: ni el servidor ni los componentes vuelven a implementar
// estas cuentas por su cuenta (consultas/acciones y tablas de presentación
// llaman a estas mismas funciones). Sin I/O — trivialmente comprobable en
// pruebas unitarias.
//
// "Fecha actual" siempre llega como parámetro (todayIso, YYYY-MM-DD) — nunca
// se lee Date.now() aquí dentro, para que estas funciones sean deterministas
// en las pruebas. El llamador real la obtiene con todayLocalIso()
// (features/agency-goals/services/period-calculator.ts) — fecha LOCAL, nunca
// vía toISOString().slice(0,10) (que da el día en UTC).

import { differenceInCalendarDays } from "date-fns";
import { parseIsoDate } from "@/features/agency-goals/services/period-calculator";
import type { AgencySalesMeetingRow, RegistrableWorkspace } from "../types";

const DAYS_PER_MONTH = 30.44;

export interface ClientRelationshipDates {
  service_started_on: string;
  service_ended_on: string | null;
}

export interface ClientRelationshipFee {
  service_started_on: string;
  service_ended_on: string | null;
  monthly_fee: number | null;
}

/**
 * Un cliente cuenta como activo "hoy" cuando ya ha comenzado (started <=
 * hoy) y, o no tiene fecha de finalización, o esa fecha es hoy o posterior.
 * Una relación con inicio futuro NUNCA es activa todavía.
 */
export function isClientActiveOn(relationship: ClientRelationshipDates, todayIso: string): boolean {
  if (relationship.service_started_on > todayIso) return false;
  if (relationship.service_ended_on === null) return true;
  return relationship.service_ended_on >= todayIso;
}

/** KPI 1 — Clientes: recuento de relaciones activas hoy. */
export function countActiveClients(relationships: ClientRelationshipDates[], todayIso: string): number {
  return relationships.filter((r) => isClientActiveOn(r, todayIso)).length;
}

/**
 * Días exactos de retención de UNA relación, a fecha de hoy. Devuelve null
 * cuando la relación todavía no ha empezado (no hay nada que retener aún) —
 * ese mismo null es lo que hace que quede excluida de la media sin lógica
 * de filtrado duplicada en el llamador.
 *
 * Si service_ended_on es una fecha futura, se usa hoy en su lugar (todavía
 * no se puede contar como retenido más allá del presente).
 */
export function retentionDaysFor(relationship: ClientRelationshipDates, todayIso: string): number | null {
  if (relationship.service_started_on > todayIso) return null;

  const effectiveEndIso =
    relationship.service_ended_on === null || relationship.service_ended_on > todayIso
      ? todayIso
      : relationship.service_ended_on;

  return differenceInCalendarDays(parseIsoDate(effectiveEndIso), parseIsoDate(relationship.service_started_on));
}

export interface RetentionKpiResult {
  averageDays: number | null;
  averageMonths: number | null;
}

/**
 * KPI 2 — Retención: media en días de todas las relaciones ya iniciadas
 * (activas o finalizadas), y esa misma media convertida a meses (días /
 * 30.44, un decimal). null cuando no hay ninguna relación iniciada todavía.
 */
export function computeRetentionKpi(relationships: ClientRelationshipDates[], todayIso: string): RetentionKpiResult {
  const days = relationships
    .map((r) => retentionDaysFor(r, todayIso))
    .filter((d): d is number => d !== null);

  if (days.length === 0) return { averageDays: null, averageMonths: null };

  const averageDays = days.reduce((sum, d) => sum + d, 0) / days.length;
  const averageMonths = Math.round((averageDays / DAYS_PER_MONTH) * 10) / 10;

  return { averageDays, averageMonths };
}

export interface AverageTicketKpiResult {
  averageEur: number | null;
  countWithFee: number;
}

/**
 * KPI 3 — Ticket medio: media de monthly_fee entre los clientes ACTIVOS hoy
 * que tengan cuota informada (NULL se excluye, nunca se trata como 0). La
 * suma se hace en céntimos enteros para no arrastrar el error de coma
 * flotante de sumar decimales EUR en JavaScript; solo la división final
 * (inevitable en cualquier media) se redondea a un céntimo para mostrarla.
 */
export function computeAverageTicketKpi(relationships: ClientRelationshipFee[], todayIso: string): AverageTicketKpiResult {
  const fees = relationships
    .filter((r) => isClientActiveOn(r, todayIso))
    .map((r) => r.monthly_fee)
    .filter((fee): fee is number => fee !== null);

  return { averageEur: averageEurCentsSafe(fees), countWithFee: fees.length };
}

/**
 * Media de una lista de importes EUR, sumando en céntimos enteros para
 * evitar el error de acumulación de coma flotante (p. ej. 0.1 + 0.2 !==
 * 0.3). Exportada aparte para poder probar el caso "sin errores de coma
 * flotante" de forma aislada. null con la lista vacía.
 */
export function averageEurCentsSafe(feesEur: number[]): number | null {
  if (feesEur.length === 0) return null;
  const totalCents = feesEur.reduce((sum, fee) => sum + Math.round(fee * 100), 0);
  const averageCents = totalCents / feesEur.length;
  return Math.round(averageCents) / 100;
}

export interface MeetingsClosureKpiResult {
  ratePercent: number | null;
  won: number;
  resolvedTotal: number;
}

/**
 * KPI 4 — Cierre de reuniones: won / (won + lost) * 100, entre reuniones
 * held. pending/scheduled/cancelled/no_show quedan fuera del numerador y del
 * denominador. null (nunca 0%) cuando resolvedTotal es 0 — todavía no existe
 * medición, no es una tasa de cierre del 0%.
 */
export function computeMeetingsClosureKpi(meetings: Pick<AgencySalesMeetingRow, "status" | "outcome">[]): MeetingsClosureKpiResult {
  const held = meetings.filter((m) => m.status === "held");
  const won = held.filter((m) => m.outcome === "won").length;
  const lost = held.filter((m) => m.outcome === "lost").length;
  const resolvedTotal = won + lost;
  const ratePercent = resolvedTotal === 0 ? null : Math.round((won / resolvedTotal) * 1000) / 10;

  return { ratePercent, won, resolvedTotal };
}

/**
 * Workspaces todavía sin registrar como cliente — para el selector de alta.
 * TAREA 3B: una relación histórica (workspace borrado, workspace_id NULL)
 * nunca puede "bloquear" un workspace real, porque un workspace_id NULL
 * simplemente no coincide con ningún id real — no hace falta filtrar los
 * NULL aparte, la comparación por id ya los descarta por construcción. Un
 * workspace_id ya registrado (no NULL) sigue excluido, sin duplicados,
 * porque cada workspace real aparece como mucho una vez en `relationships`
 * (UNIQUE(workspace_id) en la base de datos).
 */
export function computeRegistrableWorkspaces(
  allWorkspaces: RegistrableWorkspace[],
  relationships: { workspace_id: string | null }[],
): RegistrableWorkspace[] {
  const registered = new Set(relationships.map((r) => r.workspace_id).filter((id): id is string => id !== null));
  return allWorkspaces.filter((ws) => !registered.has(ws.id));
}
