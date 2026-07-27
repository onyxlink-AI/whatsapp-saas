import type { SpecialistConnectionId } from './specialist-connections';

// The ONLY 5 integrations OnyxLink actually implements today (see
// Ajustes → Integraciones / IntegrationsTab). Everything a specialist
// template or extension might reference beyond these (the 38-entry generic
// catalog in specialist-connections.ts — Gmail, ERP, SIEM, PMS, ATS...) is
// informational metadata for a possible future product, never a real,
// connectable thing in this SaaS — see GENERIC_TO_REAL_INTEGRATION below.
export const REAL_INTEGRATION_IDS = ['openrouter', 'ycloud', 'highlevel', 'google_calendar', 'airtable'] as const;
export type RealIntegrationId = (typeof REAL_INTEGRATION_IDS)[number];

export const REAL_INTEGRATION_LABELS: Record<RealIntegrationId, string> = {
  openrouter: 'OpenRouter',
  ycloud: 'WhatsApp (YCloud)',
  highlevel: 'HighLevel',
  google_calendar: 'Google Calendar',
  airtable: 'Airtable',
};

/** The 4 execution-tier integrations a capability can actually require — never OpenRouter (see below). */
export type ExecutionIntegrationId = Exclude<RealIntegrationId, 'openrouter'>;

/**
 * true = connected (a row exists AND is enabled) — never inferred, never
 * assumed. Covers the 4 execution-tier integrations only (ycloud, highlevel,
 * google_calendar, airtable) — OpenRouter has its own richer status (see
 * OpenRouterStatus below) because it has a real, separately-persisted
 * verification step, unlike the other 4 which only have "saved + enabled".
 */
export type RealIntegrationStatusMap = Partial<Record<ExecutionIntegrationId, boolean>>;

export function isRealIntegrationConnected(id: ExecutionIntegrationId, statuses: RealIntegrationStatusMap): boolean {
  return statuses[id] === true;
}

/**
 * OpenRouter's canonical status — deliberately 4 states, not a boolean,
 * because this SaaS actually has two different, real signals for it (see
 * src/features/office-virtual/server/real-integration-status.ts):
 *
 *   - Ajustes → Integraciones saving an API key sets `enabled: true` on the
 *     `integrations` row — that's "configured", not "verified": nothing
 *     confirms the key actually works.
 *   - Oficina Virtual → Orquestador's own connect/verify flow
 *     (openrouter-connection-service.ts) makes a REAL call to OpenRouter and
 *     persists the result in the SAME row's `config.office_virtual_openrouter`
 *     — only that flow can produce "verified".
 *
 * Both "configured" and "verified" are enough to activate a specialist
 * (matches how the rest of the app already calls OpenRouter — Agentes/
 * Chatbot never require the separate verify step either); "verified" is
 * shown as a stronger, more reassuring signal, never a stricter gate.
 */
export const OPENROUTER_STATUSES = ['not_configured', 'needs_attention', 'configured', 'verified'] as const;
export type OpenRouterStatus = (typeof OPENROUTER_STATUSES)[number];

export const OPENROUTER_STATUS_ACTIVATES: Record<OpenRouterStatus, boolean> = {
  not_configured: false,
  needs_attention: false,
  configured: true,
  verified: true,
};

/**
 * The ONLY bridge between the generic 38-connection prototype catalog and
 * what this product can actually connect. Only these 4 generic ids have a
 * real backing integration — every other id in SPECIALIST_CONNECTION_IDS
 * (gmail-outlook, crm's cousins like facturacion-erp, siem, ats, pms...)
 * intentionally has NO entry here, which is how a capability that needs one
 * of them gets classified as "not_available" rather than "missing_connection"
 * (see specialist-readiness.ts) — this SaaS doesn't offer that connector at
 * all, so it's never fair to tell an admin to go "connect" it.
 *
 * `openrouter` has no entry because it isn't a per-capability execution
 * connection at all — it gates the specialist's INTELLECTUAL capacity
 * (whether it can be activated to work in the first place), checked
 * separately from this map.
 */
export const GENERIC_TO_REAL_INTEGRATION: Partial<Record<SpecialistConnectionId, ExecutionIntegrationId>> = {
  whatsapp: 'ycloud',
  calendario: 'google_calendar',
  crm: 'highlevel',
  'hojas-calculo': 'airtable',
};

/**
 * Resolves which real integrations a capability's generic connection ids
 * actually correspond to. `unsupported: true` means at least one required
 * connection has no real integration behind it in this product — the
 * capability can never become available here, regardless of what else gets
 * connected.
 */
export function resolveRequiredRealIntegrations(
  connectionIds: SpecialistConnectionId[],
): { integrations: ExecutionIntegrationId[]; unsupported: boolean } {
  const mapped = connectionIds.map((id) => GENERIC_TO_REAL_INTEGRATION[id] ?? null);
  const unsupported = mapped.some((id) => id === null);
  const integrations = Array.from(new Set(mapped.filter((id): id is ExecutionIntegrationId => id !== null)));
  return { integrations, unsupported };
}
