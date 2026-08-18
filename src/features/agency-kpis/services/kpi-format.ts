// kpi-format.ts — formateo de presentación puro (sin I/O), compartido entre
// tarjetas y tablas para no duplicar el formato de moneda/fecha.

import { format } from "date-fns";

const eurFormatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatEur(amount: number): string {
  return eurFormatter.format(amount);
}

/** Formatea una fecha YYYY-MM-DD (día LOCAL, sin desfase). */
export function formatIsoDate(iso: string): string {
  return dateFormatter.format(new Date(`${iso}T00:00:00`));
}

/** Formatea un timestamp ISO completo (fecha + hora). */
export function formatIsoDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** ISO completo (con zona) -> valor local para <input type="datetime-local">. */
export function toDateTimeLocalValue(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}

/** Valor de <input type="datetime-local"> (hora LOCAL del dispositivo, sin zona) -> ISO completo en UTC. */
export function fromDateTimeLocalValue(localValue: string): string {
  return new Date(localValue).toISOString();
}
