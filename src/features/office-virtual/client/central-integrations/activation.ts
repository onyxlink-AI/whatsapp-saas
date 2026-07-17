import { selectOfficeProvisioningReadiness } from './readiness';
import type {
  OfficeActivationDecision,
  OfficeActivationRequest,
  WorkspaceCapabilitySnapshot,
} from './types';

function rejected(
  code: OfficeActivationDecision['code'],
  snapshot: WorkspaceCapabilitySnapshot,
): OfficeActivationDecision {
  return {
    allowed: false,
    code,
    nextEnabled: snapshot.virtualOfficeEnabled,
    auditRecord: null,
  };
}

export function decideVirtualOfficeActivation(
  snapshot: WorkspaceCapabilitySnapshot,
  request: OfficeActivationRequest,
): OfficeActivationDecision {
  if (request.workspaceId !== snapshot.workspaceId) {
    return rejected('workspace_mismatch', snapshot);
  }
  if (request.actor.role !== 'onyxlink_super_admin') {
    return rejected('unauthorized', snapshot);
  }
  if (request.expectedEnabled !== snapshot.virtualOfficeEnabled) {
    return rejected('stale_state', snapshot);
  }

  const nextEnabled = request.action === 'enable';
  if (nextEnabled === snapshot.virtualOfficeEnabled) {
    return rejected('already_in_state', snapshot);
  }

  const readiness = selectOfficeProvisioningReadiness(snapshot);
  if (nextEnabled && readiness.blockingRequirementIds.length > 0) {
    return rejected('prerequisites_not_met', snapshot);
  }

  return {
    allowed: true,
    code: 'approved',
    nextEnabled,
    auditRecord: {
      requestId: request.requestId,
      workspaceId: snapshot.workspaceId,
      actorId: request.actor.actorId,
      action: request.action,
      occurredAt: request.requestedAt,
      fromEnabled: snapshot.virtualOfficeEnabled,
      toEnabled: nextEnabled,
      blockingRequirementIds: readiness.blockingRequirementIds,
    },
  };
}
