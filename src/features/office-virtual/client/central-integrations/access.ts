import { selectOfficeProvisioningReadiness } from './readiness';
import type {
  OfficeAccessDecision,
  OfficeViewer,
  WorkspaceCapabilitySnapshot,
} from './types';

export function selectVirtualOfficeAccess(
  snapshot: WorkspaceCapabilitySnapshot,
  viewer: OfficeViewer,
): OfficeAccessDecision {
  if (viewer.role === 'onyxlink_super_admin') {
    return {
      visible: true,
      accessible: true,
      reason: 'super_admin_console',
    };
  }

  if (viewer.workspaceId !== snapshot.workspaceId) {
    return { visible: false, accessible: false, reason: 'workspace_mismatch' };
  }

  if (viewer.role !== 'workspace_admin') {
    return { visible: false, accessible: false, reason: 'insufficient_role' };
  }

  const readiness = selectOfficeProvisioningReadiness(snapshot);
  if (!snapshot.virtualOfficeEnabled) {
    return { visible: false, accessible: false, reason: 'office_disabled' };
  }
  if (!readiness.accessible) {
    return { visible: false, accessible: false, reason: 'office_misconfigured' };
  }

  return { visible: true, accessible: true, reason: 'workspace_active' };
}
