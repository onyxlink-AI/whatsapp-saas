import { useEffect, useMemo, useRef, useState } from 'react';
import { decideVirtualOfficeActivation, selectOfficeProvisioningReadiness } from '../central-integrations';
import type {
  OfficeActivationAction,
  OfficeActivationDecision,
  OfficeActorRole,
  OfficeProvisioningReadiness,
  WorkspaceCapabilitySnapshot,
} from '../central-integrations/types';
import type { WorkspaceWhatsAppBinding } from '../central-integrations/whatsapp-binding';
import { fetchWorkspaceCapabilitySnapshot, setOfficeVirtualEnabled } from '../lib/saasWorkspaceCapabilityAdapter';

// Real per-workspace data via src/app/api/workspace/[id]/office-virtual/capability-snapshot
// (GET) and the pre-existing office_virtual_enabled toggle route (PATCH) — no
// second activation flag. Readiness/binding stay pure functions of whatever
// snapshot is currently loaded; only the data source changed.

function emptySnapshot(workspaceId: string): WorkspaceCapabilitySnapshot {
  return {
    workspaceId,
    capturedAt: new Date(0).toISOString(),
    virtualOfficeEnabled: false,
    whatsappAgent: { enabled: false, activeAgentId: null, activeAgentType: null },
    ycloud: { configured: false, enabled: false, health: 'unknown' },
    voice: { configured: false, enabled: false, health: 'unknown', assistantId: null },
    chatbot: { configured: false, enabled: false, health: 'unknown', provider: null },
    features: { advancedMemory: false, crossChannelMemory: false, pipelineAi: false, coldLeadRecovery: false },
  };
}

function emptyBinding(workspaceId: string): WorkspaceWhatsAppBinding {
  return {
    workspaceId,
    officeAgentId: 'lead-intake',
    state: 'not_connected',
    connectionId: null,
    provider: 'ycloud',
    phoneNumberMasked: null,
    activeAgentId: null,
    activeAgentType: null,
  };
}

export type OfficeActivation = {
  /** True while the initial snapshot is being fetched from the backend. */
  loading: boolean;
  /** Transport/backend failure loading or persisting real state. */
  loadError: string | null;
  snapshot: WorkspaceCapabilitySnapshot;
  readiness: OfficeProvisioningReadiness;
  whatsappBinding: WorkspaceWhatsAppBinding;
  lastDecision: OfficeActivationDecision | null;
  activate: () => void;
  deactivate: () => void;
};

export function useOfficeActivation(
  actorId: string,
  actorRole: OfficeActorRole,
  workspaceId: string,
): OfficeActivation {
  const [snapshot, setSnapshot] = useState<WorkspaceCapabilitySnapshot>(() => emptySnapshot(workspaceId));
  const [whatsappBinding, setWhatsappBinding] = useState<WorkspaceWhatsAppBinding>(() => emptyBinding(workspaceId));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<OfficeActivationDecision | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchWorkspaceCapabilitySnapshot(workspaceId).then((result) => {
      if (cancelled) return;
      if (result.status === 'error') {
        setLoadError(result.message);
      } else {
        setSnapshot(result.snapshot);
        setWhatsappBinding(result.whatsappBinding);
        setLoadError(null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const readiness = useMemo(() => selectOfficeProvisioningReadiness(snapshot), [snapshot]);

  const requestActivation = (action: OfficeActivationAction) => {
    if (loading || busyRef.current) return;
    const decision = decideVirtualOfficeActivation(snapshot, {
      requestId: crypto.randomUUID(),
      workspaceId: snapshot.workspaceId,
      action,
      expectedEnabled: snapshot.virtualOfficeEnabled,
      requestedAt: new Date().toISOString(),
      actor: { actorId, role: actorRole, workspaceId: snapshot.workspaceId },
    });
    setLastDecision(decision);
    if (!decision.allowed) return;

    busyRef.current = true;
    setOfficeVirtualEnabled(workspaceId, decision.nextEnabled).then((result) => {
      busyRef.current = false;
      if (result.status === 'ok') {
        setLoadError(null);
        setSnapshot((prev) => ({ ...prev, virtualOfficeEnabled: result.enabled }));
      } else {
        setLoadError(result.message);
      }
    });
  };

  const activate = () => requestActivation('enable');
  const deactivate = () => requestActivation('disable');

  return { loading, loadError, snapshot, readiness, whatsappBinding, lastDecision, activate, deactivate };
}
