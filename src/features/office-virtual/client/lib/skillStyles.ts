// Same pattern as statusStyles.ts / reportStyles.ts — single source for how
// Codex's real SkillsFeed enums (src/hooks/useSkillsFeed.ts) read across the
// Taller de Skills UI. See COORDINACION_CLAUDE_CODEX.md.
import type { SkillApprovalPolicy, SkillOrigin, SkillSimulationStatus, SkillStatus, SkillTriggerType } from '../hooks/useSkillsFeed';

export type { SkillApprovalPolicy, SkillOrigin, SkillSimulationStatus, SkillStatus, SkillTriggerType };

export const SKILL_ORIGIN_LABEL_ES: Record<SkillOrigin, string> = {
  installed: 'Instalada',
  candidate: 'Candidata',
};

export const SKILL_ORIGIN_TW: Record<SkillOrigin, string> = {
  installed: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  candidate: 'text-sky-300/80 border-sky-500/25 bg-sky-500/[0.06]',
};

export const SKILL_STATUS_LABEL_ES: Record<SkillStatus, string> = {
  draft: 'Borrador',
  testing: 'En pruebas',
  pending_approval: 'Pendiente de aprobación',
  approved: 'Aprobada',
  published: 'Publicada',
  paused: 'Pausada',
  rejected: 'Rechazada',
};

export const SKILL_STATUS_TW: Record<SkillStatus, string> = {
  draft: 'text-white/50 border-white/10 bg-white/[0.03]',
  testing: 'text-sky-300/80 border-sky-500/25 bg-sky-500/[0.06]',
  pending_approval: 'text-fuchsia-300/80 border-fuchsia-500/25 bg-fuchsia-500/[0.06]',
  approved: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  published: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  paused: 'text-orange-300/80 border-orange-500/25 bg-orange-500/[0.06]',
  rejected: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
};

export const SKILL_TRIGGER_TYPE_LABEL_ES: Record<SkillTriggerType, string> = {
  keyword: 'Palabra clave',
  event: 'Evento',
  schedule: 'Horario',
  manual: 'Manual',
};

export const SKILL_APPROVAL_POLICY_LABEL_ES: Record<SkillApprovalPolicy, string> = {
  always: 'Siempre requiere aprobación',
  sensitive_only: 'Solo en acciones sensibles',
  never: 'Sin aprobación humana',
};

export const SKILL_SIMULATION_STATUS_LABEL_ES: Record<SkillSimulationStatus, string> = {
  pending: 'Pendiente',
  running: 'Ejecutando',
  success: 'Correcto',
  error: 'Error',
};

export const SKILL_SIMULATION_STATUS_TW: Record<SkillSimulationStatus, string> = {
  pending: 'text-white/40 border-white/10 bg-white/[0.03]',
  running: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  success: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  error: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
};

export function formatSkillCost(usd: number): string {
  return usd.toLocaleString('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export function formatSkillDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}
