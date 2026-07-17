import type { AgentId } from '../../schemas';

export type OfficePromptSource = 'office_configuration' | 'whatsapp_panel' | 'vapi';

export type OfficeAgentPromptOwnership = {
  agentId: AgentId;
  source: OfficePromptSource;
  editableInOffice: boolean;
  externalReferenceField: 'activeWhatsappAgentId' | 'vapiAssistantId' | null;
};

export const OFFICE_PROMPT_OWNERSHIP: Record<AgentId, OfficeAgentPromptOwnership> = {
  coordinator: {
    agentId: 'coordinator',
    source: 'office_configuration',
    editableInOffice: true,
    externalReferenceField: null,
  },
  'lead-intake': {
    agentId: 'lead-intake',
    source: 'whatsapp_panel',
    editableInOffice: false,
    externalReferenceField: 'activeWhatsappAgentId',
  },
  strategy: {
    agentId: 'strategy',
    source: 'vapi',
    editableInOffice: false,
    externalReferenceField: 'vapiAssistantId',
  },
  proposal: {
    agentId: 'proposal',
    source: 'office_configuration',
    editableInOffice: true,
    externalReferenceField: null,
  },
  operations: {
    agentId: 'operations',
    source: 'office_configuration',
    editableInOffice: true,
    externalReferenceField: null,
  },
  content: {
    agentId: 'content',
    source: 'office_configuration',
    editableInOffice: true,
    externalReferenceField: null,
  },
  'review-qa': {
    agentId: 'review-qa',
    source: 'office_configuration',
    editableInOffice: true,
    externalReferenceField: null,
  },
};

export function selectOfficeAgentPromptOwnership(agentId: AgentId): OfficeAgentPromptOwnership {
  return OFFICE_PROMPT_OWNERSHIP[agentId];
}
