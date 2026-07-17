import type { AgentId } from '../../schemas';
import type { OfficeActivitySource } from './types';

export type OfficeSeatRole = 'orchestrator' | 'whatsapp' | 'voice' | 'specialist';

export type SaasBacking =
  | 'office-events'
  | 'whatsapp-active-agent'
  | 'vapi-assistant'
  | 'future-specialist';

export type OfficeSeatBinding = {
  agentId: AgentId;
  role: OfficeSeatRole;
  displayLabel: string;
  saasBacking: SaasBacking;
  backendReady: boolean;
  configurable: boolean;
};

/**
 * Stable bridge between the prototype's technical AgentIds and the final SaaS.
 * AgentIds stay unchanged so the existing workflow engine remains compatible.
 */
export const OFFICE_SEAT_BINDINGS: Record<AgentId, OfficeSeatBinding> = {
  coordinator: {
    agentId: 'coordinator',
    role: 'orchestrator',
    displayLabel: 'Orquestador',
    saasBacking: 'office-events',
    backendReady: false,
    configurable: false,
  },
  'lead-intake': {
    agentId: 'lead-intake',
    role: 'whatsapp',
    displayLabel: 'Agente WhatsApp',
    saasBacking: 'whatsapp-active-agent',
    backendReady: true,
    configurable: false,
  },
  strategy: {
    agentId: 'strategy',
    role: 'voice',
    displayLabel: 'Agente de Voz',
    saasBacking: 'vapi-assistant',
    backendReady: true,
    configurable: false,
  },
  proposal: {
    agentId: 'proposal',
    role: 'specialist',
    displayLabel: 'Especialista 1',
    saasBacking: 'future-specialist',
    backendReady: false,
    configurable: true,
  },
  operations: {
    agentId: 'operations',
    role: 'specialist',
    displayLabel: 'Especialista 2',
    saasBacking: 'future-specialist',
    backendReady: false,
    configurable: true,
  },
  content: {
    agentId: 'content',
    role: 'specialist',
    displayLabel: 'Especialista 3',
    saasBacking: 'future-specialist',
    backendReady: false,
    configurable: true,
  },
  'review-qa': {
    agentId: 'review-qa',
    role: 'specialist',
    displayLabel: 'Especialista 4',
    saasBacking: 'future-specialist',
    backendReady: false,
    configurable: true,
  },
};

const DEFAULT_AGENT_BY_SOURCE: Record<OfficeActivitySource, AgentId> = {
  whatsapp: 'lead-intake',
  voice: 'strategy',
  manual: 'coordinator',
  automation: 'operations',
};

export function defaultAgentForSource(source: OfficeActivitySource): AgentId {
  return DEFAULT_AGENT_BY_SOURCE[source];
}

export function selectConfigurableOfficeSeats(): OfficeSeatBinding[] {
  return Object.values(OFFICE_SEAT_BINDINGS).filter((binding) => binding.configurable);
}
