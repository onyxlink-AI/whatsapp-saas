import { useMemo, useState } from 'react';
import {
  createIncompleteWorkspaceFixture,
  createReadyWorkspaceFixture,
  decideVirtualOfficeActivation,
  resolveWorkspaceWhatsAppBinding,
  selectOfficeProvisioningReadiness,
} from '../central-integrations';
import type {
  OfficeActivationAction,
  OfficeActivationDecision,
  OfficeActorRole,
  OfficeProvisioningReadiness,
  WorkspaceCapabilitySnapshot,
} from '../central-integrations/types';
import type { WorkspaceWhatsAppBinding, WorkspaceWhatsAppConnectionInput } from '../central-integrations/whatsapp-binding';

// Adapter hook for src/central-integrations (Codex's readiness + activation +
// whatsapp-binding contracts — see COORDINACION_CLAUDE_CODEX.md). Seeds from
// Codex's own fixtures so the four provisioning states can all be exercised
// before a real workspace snapshot exists. activate/deactivate call Codex's
// decideVirtualOfficeActivation directly — this hook never re-implements
// permission or requirement checks, it only relays the decision.

export type ActivationScenario = 'not_ready' | 'ready_to_enable' | 'active' | 'misconfigured';

const SCENARIOS: Record<ActivationScenario, () => WorkspaceCapabilitySnapshot> = {
  not_ready: createIncompleteWorkspaceFixture,
  ready_to_enable: createReadyWorkspaceFixture,
  active: () => createReadyWorkspaceFixture({ virtualOfficeEnabled: true }),
  misconfigured: () => ({ ...createIncompleteWorkspaceFixture(), virtualOfficeEnabled: true }),
};

// Synthetic demo number for the mock YCloud connection — masked by
// resolveWorkspaceWhatsAppBinding before it ever reaches state or render.
// Codex hasn't shipped a connection fixture yet; this stands in for "the
// client's real YCloud connection" until one exists.
const MOCK_PHONE_NUMBER = '+52 55 1234 5678';

function buildMockConnection(snapshot: WorkspaceCapabilitySnapshot): WorkspaceWhatsAppConnectionInput {
  return {
    workspaceId: snapshot.workspaceId,
    connectionId: `${snapshot.workspaceId}-ycloud`,
    provider: 'ycloud',
    phoneNumber: snapshot.ycloud.configured ? MOCK_PHONE_NUMBER : null,
    health: snapshot.ycloud.health,
  };
}

export type OfficeActivation = {
  scenario: ActivationScenario;
  setScenario: (scenario: ActivationScenario) => void;
  snapshot: WorkspaceCapabilitySnapshot;
  readiness: OfficeProvisioningReadiness;
  whatsappBinding: WorkspaceWhatsAppBinding;
  lastDecision: OfficeActivationDecision | null;
  activate: () => void;
  deactivate: () => void;
};

export function useOfficeActivation(actorId: string, actorRole: OfficeActorRole): OfficeActivation {
  const [scenario, setScenarioState] = useState<ActivationScenario>('ready_to_enable');
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const [lastDecision, setLastDecision] = useState<OfficeActivationDecision | null>(null);

  const snapshot = useMemo(() => {
    const base = SCENARIOS[scenario]();
    return enabledOverride === null ? base : { ...base, virtualOfficeEnabled: enabledOverride };
  }, [scenario, enabledOverride]);

  const readiness = useMemo(() => selectOfficeProvisioningReadiness(snapshot), [snapshot]);

  const whatsappBinding = useMemo(
    () => resolveWorkspaceWhatsAppBinding(snapshot, buildMockConnection(snapshot)),
    [snapshot],
  );

  const setScenario = (next: ActivationScenario) => {
    setScenarioState(next);
    setEnabledOverride(null);
    setLastDecision(null);
  };

  const requestActivation = (action: OfficeActivationAction) => {
    const decision = decideVirtualOfficeActivation(snapshot, {
      requestId: crypto.randomUUID(),
      workspaceId: snapshot.workspaceId,
      action,
      expectedEnabled: snapshot.virtualOfficeEnabled,
      requestedAt: new Date().toISOString(),
      actor: { actorId, role: actorRole, workspaceId: snapshot.workspaceId },
    });
    setLastDecision(decision);
    if (decision.allowed) setEnabledOverride(decision.nextEnabled);
  };

  const activate = () => requestActivation('enable');
  const deactivate = () => requestActivation('disable');

  return { scenario, setScenario, snapshot, readiness, whatsappBinding, lastDecision, activate, deactivate };
}
