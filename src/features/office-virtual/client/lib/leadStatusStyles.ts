import type { ContactStage } from '../central-contacts/types';

// Mirrors the real contacts.stage values from WhatsApp-saas (new/engaged/
// qualified/customer/lost). Shared by ContactosView and Contact360Panel so
// the palette never drifts between the list and the detail panel.
export const LEAD_STATUS_LABEL_ES: Record<ContactStage, string> = {
  new: 'Nuevo',
  engaged: 'Contactado',
  qualified: 'Calificado',
  customer: 'Cliente',
  lost: 'Perdido',
};

export const LEAD_STATUS_TW: Record<ContactStage, string> = {
  new: 'text-sky-300 border-sky-500/30 bg-sky-500/[0.06]',
  engaged: 'text-amber-300 border-amber-500/30 bg-amber-500/[0.06]',
  qualified: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/[0.06]',
  customer: 'text-violet-300 border-violet-400/30 bg-violet-500/[0.06]',
  lost: 'text-rose-300 border-rose-500/30 bg-rose-500/[0.06]',
};
