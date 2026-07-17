import type { WorkspaceCapabilitySnapshot } from './types';

const healthyChannel = {
  configured: true,
  enabled: true,
  health: 'healthy',
  checkedAt: '2026-07-14T15:00:00.000Z',
} as const;

export function createReadyWorkspaceFixture(
  overrides: Partial<WorkspaceCapabilitySnapshot> = {},
): WorkspaceCapabilitySnapshot {
  return {
    workspaceId: 'workspace-ready',
    capturedAt: '2026-07-14T15:01:00.000Z',
    virtualOfficeEnabled: false,
    whatsappAgent: {
      enabled: true,
      activeAgentId: 'agent-setter-1',
      activeAgentType: 'setter',
    },
    ycloud: healthyChannel,
    voice: { ...healthyChannel, assistantId: 'vapi-assistant-1' },
    features: {
      advancedMemory: true,
      crossChannelMemory: true,
      pipelineAi: true,
      coldLeadRecovery: true,
    },
    ...overrides,
  };
}

export function createIncompleteWorkspaceFixture(): WorkspaceCapabilitySnapshot {
  return createReadyWorkspaceFixture({
    workspaceId: 'workspace-incomplete',
    ycloud: {
      configured: true,
      enabled: true,
      health: 'error',
      checkedAt: '2026-07-14T15:00:00.000Z',
      issueCode: 'webhook_signature_failed',
    },
    voice: {
      configured: false,
      enabled: false,
      health: 'unknown',
      assistantId: null,
    },
    features: {
      advancedMemory: true,
      crossChannelMemory: false,
      pipelineAi: true,
      coldLeadRecovery: false,
    },
  });
}
