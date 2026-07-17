/** Representative normalized payloads for local development and contract tests. */
export const CENTRAL_EVENT_FIXTURES = {
  whatsappReceived: {
    eventId: 'ycloud:wamid.HBgLM001:received',
    workspaceId: 'workspace-onyxlink-demo',
    occurredAt: '2026-07-14T12:30:00.000Z',
    conversationId: 'conversation-001',
    phase: 'received',
    payload: { wamid: 'wamid.HBgLM001', messageType: 'text' },
  },
  voiceEnded: {
    eventId: 'vapi:call-001:ended',
    workspaceId: 'workspace-onyxlink-demo',
    occurredAt: '2026-07-14T12:35:00.000Z',
    callId: 'call-001',
    phase: 'ended',
    agentId: 'strategy',
    payload: { durationSeconds: 183, endedReason: 'customer-ended-call' },
  },
  workflowBlocked: {
    eventId: 'workflow:run-001:operations:blocked',
    workspaceId: 'workspace-onyxlink-demo',
    occurredAt: '2026-07-14T12:40:00.000Z',
    runId: 'run-001',
    phase: 'blocked',
    agentId: 'operations',
    entityType: 'task',
    entityId: 'task-001',
    payload: { reason: 'approval_required' },
  },
  approvalRequested: {
    eventId: 'approval:approval-001:requested',
    workspaceId: 'workspace-onyxlink-demo',
    occurredAt: '2026-07-14T12:41:00.000Z',
    approvalId: 'approval-001',
    runId: 'run-001',
    phase: 'requested',
    requestedByAgentId: 'review-qa',
  },
} as const;

export const INVALID_CENTRAL_EVENT_FIXTURES = {
  missingWorkspace: {
    eventId: 'ycloud:invalid:received',
    occurredAt: '2026-07-14T12:30:00.000Z',
    conversationId: 'conversation-001',
    phase: 'received',
  },
  invalidTimestamp: {
    eventId: 'vapi:invalid:ended',
    workspaceId: 'workspace-onyxlink-demo',
    occurredAt: 'sometime-yesterday',
    callId: 'call-001',
    phase: 'ended',
  },
  unknownVoicePhase: {
    eventId: 'vapi:future:event',
    workspaceId: 'workspace-onyxlink-demo',
    occurredAt: '2026-07-14T12:35:00.000Z',
    callId: 'call-001',
    phase: 'partial-transcript',
  },
} as const;
