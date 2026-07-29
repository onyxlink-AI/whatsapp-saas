import type { OfficeProvisioningState } from '../central-integrations/types';

// Single source for how each OfficeProvisioningState (src/central-integrations,
// Codex's readiness contract) reads across the admin UI — same pattern as
// statusStyles.ts so the palette never drifts between views.
export const ACTIVATION_STATE_LABEL_ES: Record<OfficeProvisioningState, string> = {
  not_ready: 'No configurada',
  ready_to_enable: 'Lista para activar',
  active: 'Activa',
  misconfigured: 'Error',
};

export const ACTIVATION_STATE_BADGE_TW: Record<OfficeProvisioningState, string> = {
  not_ready: 'text-white/45 border-white/10 bg-white/[0.03]',
  ready_to_enable: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  active: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  misconfigured: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
};
