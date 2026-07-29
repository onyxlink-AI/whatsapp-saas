import { useEffect, useMemo, useRef, useState } from 'react';
import { decideVirtualOfficeActivation, isWhatsAppChannelConfigured, selectOfficeProvisioningReadiness } from '../central-integrations';
import type {
  OfficeActivationAction,
  OfficeActivationDecision,
  OfficeActorRole,
  OfficeProvisioningReadiness,
  WorkspaceCapabilitySnapshot,
} from '../central-integrations/types';
import type { WorkspaceWhatsAppBinding } from '../central-integrations/whatsapp-binding';
import { fetchWorkspaceCapabilitySnapshot, setOfficeVirtualEnabled, setOfficeWhatsAppEnabled } from '../lib/saasWorkspaceCapabilityAdapter';

// Real per-workspace data via src/app/api/workspace/[id]/office-virtual/capability-snapshot
// (GET) and the pre-existing office_virtual_enabled toggle route (PATCH) — no
// second activation flag. Readiness/binding stay pure functions of whatever
// snapshot is currently loaded; only the data source changed.

function emptySnapshot(workspaceId: string): WorkspaceCapabilitySnapshot {
  return {
    workspaceId,
    capturedAt: new Date(0).toISOString(),
    virtualOfficeEnabled: false,
    whatsappAgent: { enabled: false, officeEnabled: false, activeAgentId: null, activeAgentType: null },
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
  whatsappConfigured: boolean;
  whatsappBusy: boolean;
  lastDecision: OfficeActivationDecision | null;
  activate: () => void;
  deactivate: () => void;
  activateWhatsApp: () => void;
  deactivateWhatsApp: () => void;
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
  const [whatsappBusy, setWhatsappBusy] = useState(false);
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
  const whatsappConfigured = useMemo(() => isWhatsAppChannelConfigured(snapshot), [snapshot]);

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

  const setWhatsAppActivation = (enabled: boolean) => {
    if (loading || busyRef.current || whatsappBusy || (enabled && !whatsappConfigured)) return;
    busyRef.current = true;
    setWhatsappBusy(true);
    setOfficeWhatsAppEnabled(workspaceId, enabled).then(async (result) => {
      if (result.status === 'error') {
        setLoadError(result.message);
      } else {
        const refreshed = await fetchWorkspaceCapabilitySnapshot(workspaceId);
        if (refreshed.status === 'ok') {
          setSnapshot(refreshed.snapshot);
          setWhatsappBinding(refreshed.whatsappBinding);
          setLoadError(null);
        } else {
          setLoadError(refreshed.message);
        }
      }
      busyRef.current = false;
      setWhatsappBusy(false);
    });
  };

  const activateWhatsApp = () => setWhatsAppActivation(true);
  const deactivateWhatsApp = () => setWhatsAppActivation(false);

  return {
    loading,
    loadError,
    snapshot,
    readiness,
    whatsappBinding,
    whatsappConfigured,
    whatsappBusy,
    lastDecision,
    activate,
    deactivate,
    activateWhatsApp,
    deactivateWhatsApp,
  };
}
