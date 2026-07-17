import type { AgentId } from '../../schemas';
import type { IntegrationHealth, WhatsAppAgentType, WorkspaceCapabilitySnapshot } from './types';

export type WorkspaceWhatsAppConnectionInput = {
  workspaceId: string;
  connectionId: string;
  provider: 'ycloud';
  phoneNumber: string | null;
  health: IntegrationHealth;
};

export type WorkspaceWhatsAppBindingState =
  | 'ready'
  | 'workspace_mismatch'
  | 'not_connected'
  | 'number_missing'
  | 'integration_unhealthy'
  | 'agent_inactive';

export type WorkspaceWhatsAppBinding = {
  workspaceId: string;
  officeAgentId: AgentId;
  state: WorkspaceWhatsAppBindingState;
  connectionId: string | null;
  provider: 'ycloud';
  phoneNumberMasked: string | null;
  activeAgentId: string | null;
  activeAgentType: WhatsAppAgentType | null;
};

function maskPhoneNumber(phoneNumber: string): string | null {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `*** *** ${digits.slice(-4)}`;
}

function unavailableBinding(
  snapshot: WorkspaceCapabilitySnapshot,
  state: Exclude<WorkspaceWhatsAppBindingState, 'ready'>,
): WorkspaceWhatsAppBinding {
  return {
    workspaceId: snapshot.workspaceId,
    officeAgentId: 'lead-intake',
    state,
    connectionId: null,
    provider: 'ycloud',
    phoneNumberMasked: null,
    activeAgentId: null,
    activeAgentType: null,
  };
}

/**
 * Resolves the fixed WhatsApp desk against the current workspace connection.
 * The returned projection never contains the raw phone number or credentials.
 */
export function resolveWorkspaceWhatsAppBinding(
  snapshot: WorkspaceCapabilitySnapshot,
  connection: WorkspaceWhatsAppConnectionInput | null,
): WorkspaceWhatsAppBinding {
  if (!connection) return unavailableBinding(snapshot, 'not_connected');
  if (connection.workspaceId !== snapshot.workspaceId) {
    return unavailableBinding(snapshot, 'workspace_mismatch');
  }

  const phoneNumberMasked = connection.phoneNumber
    ? maskPhoneNumber(connection.phoneNumber)
    : null;
  if (!phoneNumberMasked) return unavailableBinding(snapshot, 'number_missing');

  if (
    !snapshot.ycloud.configured ||
    !snapshot.ycloud.enabled ||
    snapshot.ycloud.health !== 'healthy' ||
    connection.health !== 'healthy'
  ) {
    return unavailableBinding(snapshot, 'integration_unhealthy');
  }

  if (
    !snapshot.whatsappAgent.enabled ||
    !snapshot.whatsappAgent.activeAgentId ||
    !snapshot.whatsappAgent.activeAgentType
  ) {
    return unavailableBinding(snapshot, 'agent_inactive');
  }

  return {
    workspaceId: snapshot.workspaceId,
    officeAgentId: 'lead-intake',
    state: 'ready',
    connectionId: connection.connectionId,
    provider: 'ycloud',
    phoneNumberMasked,
    activeAgentId: snapshot.whatsappAgent.activeAgentId,
    activeAgentType: snapshot.whatsappAgent.activeAgentType,
  };
}
