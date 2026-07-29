import { ANALYTICS_PERIOD_LABEL_ES } from './analyticsStyles';
import type { ReportFormat, ReportKind, ReportMetric, ReportStatus } from '../central-reports';

// Same pattern as statusStyles.ts / taskStyles.ts / routineStyles.ts — single
// source for how Codex's real central-reports enums (ReportKind, ReportStatus,
// ReportFormat) read across the app. See COORDINACION_CLAUDE_CODEX.md.
export const REPORT_KIND_LABEL_ES: Record<ReportKind, string> = {
  overview: 'Actividad general',
  agents: 'Rendimiento por agente',
  channels: 'Canales',
  tasks: 'Tareas',
  routines: 'Rutinas',
  approvals: 'Aprobaciones',
  incidents: 'Incidencias',
};

export const REPORT_KIND_ORDER: ReportKind[] = ['overview', 'agents', 'channels', 'tasks', 'routines', 'approvals', 'incidents'];

export const REPORT_KIND_DESCRIPTION_ES: Record<ReportKind, string> = {
  overview: 'Resumen de eventos y actividad de toda la oficina en el periodo.',
  agents: 'Carga, cumplimiento y tiempos por agente.',
  channels: 'Volumen y distribución por WhatsApp y Voz.',
  tasks: 'Creadas, completadas, vencidas y por origen.',
  routines: 'Ejecuciones, éxito y duración de las rutinas programadas.',
  approvals: 'Solicitudes de aprobación y tiempos de espera.',
  incidents: 'Bloqueos, fallos y motivos de atención.',
};

export const REPORT_STATUS_LABEL_ES: Record<ReportStatus, string> = {
  draft: 'Borrador',
  generating: 'Generando',
  ready: 'Listo',
  failed: 'Fallido',
  deleted: 'Eliminado',
};

export const REPORT_STATUS_TW: Record<ReportStatus, string> = {
  draft: 'text-white/50 border-white/10 bg-white/[0.03]',
  generating: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  ready: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  failed: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
  deleted: 'text-white/30 border-white/10 bg-white/[0.02]',
};

export const REPORT_FORMAT_LABEL_ES: Record<ReportFormat, string> = {
  pdf: 'PDF',
  csv: 'CSV',
};

export function formatReportMetricValue(metric: ReportMetric): string {
  if (metric.unit === 'percent') return `${metric.value}%`;
  if (metric.unit === 'milliseconds') {
    const minutes = Math.round(metric.value / 60_000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h`;
    return `${Math.round(hours / 24)} d`;
  }
  return String(metric.value);
}

export function humanizeReportColumn(column: string): string {
  const spaced = column.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLocaleLowerCase('es');
}

export { ANALYTICS_PERIOD_LABEL_ES as REPORT_PERIOD_LABEL_ES };
