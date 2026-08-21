// TAREA 4B — formato de horas compartido entre la cuadrícula y el
// formulario. hour=23 representa 23:00-00:00 (medianoche), igual que
// documenta la migración de TAREA 4A.

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatHourStart(hour: number): string {
  return `${pad2(hour)}:00`;
}

/** "09:00–10:00" — para mostrar dentro de la celda/lista. */
export function formatHourRange(hour: number): string {
  const nextHour = (hour + 1) % 24;
  return `${formatHourStart(hour)}–${formatHourStart(nextHour)}`;
}

/** "09:00 a 10:00" — para frases/aria-label ("... de 09:00 a 10:00"). */
export function formatHourRangeWords(hour: number): string {
  const nextHour = (hour + 1) % 24;
  return `${formatHourStart(hour)} a ${formatHourStart(nextHour)}`;
}
