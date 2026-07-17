// Shared by ActividadView and PanelView so "hace X" reads consistently across views.
export function relativeTime(occurredAt: string, now: number): string {
  const deltaMs = now - Date.parse(occurredAt);
  const seconds = Math.max(0, Math.round(deltaMs / 1000));
  if (seconds < 5) return 'ahora mismo';
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `hace ${hours} h`;
}

// For scheduled/future timestamps (e.g. Rutinas' next run) — relativeTime()
// assumes the past and clamps negative deltas to "ahora mismo", which reads
// as wrong for something that hasn't happened yet.
export function untilTime(occurredAt: string, now: number): string {
  const deltaMs = Date.parse(occurredAt) - now;
  const seconds = Math.max(0, Math.round(deltaMs / 1000));
  if (seconds < 5) return 'ahora mismo';
  if (seconds < 60) return `en ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `en ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `en ${hours} h`;
  const days = Math.round(hours / 24);
  return `en ${days} d`;
}
