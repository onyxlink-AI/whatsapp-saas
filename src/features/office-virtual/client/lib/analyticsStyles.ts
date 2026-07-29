import type { AnalyticsPeriod } from '../central-events';
import type { TaskSource } from '../central-tasks';
import { SOURCE_LABEL_ES } from './statusStyles';

// Reuses statusStyles.ts's SOURCE_LABEL_ES (whatsapp/voice/manual/automation)
// instead of redefining those four labels — only adds the one TaskSource
// value central-events doesn't have ('routine').
export const TASK_SOURCE_LABEL_ES: Record<TaskSource, string> = {
  ...SOURCE_LABEL_ES,
  routine: 'Rutina',
};

export const ANALYTICS_PERIOD_LABEL_ES: Record<AnalyticsPeriod, string> = {
  today: 'Hoy',
  '24h': 'Últimas 24 h',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
};
