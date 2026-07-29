// Standalone (zero-dependency) seat identifiers so configuration.ts and
// vertical-application-plan.ts can both reference the same 8 generic
// specialist seats without an import cycle between them.
export type ConfigurableOfficeAgentId =
  | 'specialist-1'
  | 'specialist-2'
  | 'specialist-3'
  | 'specialist-4'
  | 'specialist-5'
  | 'specialist-6'
  | 'specialist-7'
  | 'specialist-8';

export const CONFIGURABLE_AGENT_IDS: ConfigurableOfficeAgentId[] = [
  'specialist-1',
  'specialist-2',
  'specialist-3',
  'specialist-4',
  'specialist-5',
  'specialist-6',
  'specialist-7',
  'specialist-8',
];

/** Non-configurable seats: the orchestrator plus the 3 SaaS-reused channel seats (WhatsApp, voice, chatbot). */
export type FixedOfficeSeatId = 'coordinator' | 'lead-intake' | 'strategy' | 'chatbot';

export const FIXED_AGENT_IDS: FixedOfficeSeatId[] = ['coordinator', 'lead-intake', 'strategy', 'chatbot'];

export type OfficeSeatId = FixedOfficeSeatId | ConfigurableOfficeAgentId;

/** Default seat color, used only until the workspace picks its own via the configurator. */
export const DEFAULT_SPECIALIST_COLORS: Record<ConfigurableOfficeAgentId, string> = {
  'specialist-1': '#2563eb',
  'specialist-2': '#e11d48',
  'specialist-3': '#d97706',
  'specialist-4': '#0891b2',
  'specialist-5': '#7c3aed',
  'specialist-6': '#059669',
  'specialist-7': '#db2777',
  'specialist-8': '#4338ca',
};
