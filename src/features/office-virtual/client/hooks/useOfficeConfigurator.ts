import { useState } from 'react';
import { agents as staticOfficeAgents } from '../agents';
import {
  applyOfficeConfigurationCommand,
  createOfficeConfigurationState,
  provisionWorkspaceOffice,
} from '../central-integrations';
import type {
  ConfigurableOfficeAgentId,
  OfficeConfigurationMutationResult,
  OfficeConfigurationState,
  OfficeSpecialistConfiguration,
} from '../central-integrations/configuration';
import type { WorkspaceOfficeConfiguration, WorkspaceOfficeSeat } from '../central-integrations/preset';
import type { OfficeActorRole, OfficeViewer } from '../central-integrations/types';

// Adapter hook for src/central-integrations/configuration.ts (Codex's real
// draft/publish/history contract) and preset.ts (the template). Every
// mutation goes through Codex's `applyOfficeConfigurationCommand` reducer —
// this hook keeps local text-field drafts only so typing doesn't dispatch a
// command per keystroke, and commits them as commands on save/reset/publish.
// See COORDINACION_CLAUDE_CODEX.md.
//
// `specialistColors` is the one field here that never goes through Codex's
// reducer: color is a purely cosmetic, visual-layer concern (same spirit as
// the `VISUAL` table in agents.ts, which already keeps color out of the real
// agent registry) — it doesn't need permission checks, revisions or an audit
// trail the way name/function/instructions do. It's still tracked per
// specialist and reset alongside the rest so "Restablecer" is complete.

const CONFIGURABLE_AGENT_IDS: ConfigurableOfficeAgentId[] = ['proposal', 'operations', 'content', 'review-qa'];

function originalColor(agentId: ConfigurableOfficeAgentId): string {
  return staticOfficeAgents.find((a) => a.id === agentId)?.color ?? '#a78bfa';
}

export type SpecialistDraft = Omit<OfficeSpecialistConfiguration, 'agentId'>;

function cloneSpecialistDrafts(
  specialists: Record<ConfigurableOfficeAgentId, OfficeSpecialistConfiguration>,
): Record<ConfigurableOfficeAgentId, SpecialistDraft> {
  const result: Partial<Record<ConfigurableOfficeAgentId, SpecialistDraft>> = {};
  for (const agentId of CONFIGURABLE_AGENT_IDS) {
    const { agentId: _drop, ...draft } = specialists[agentId];
    result[agentId] = { ...draft, allowedActions: [...draft.allowedActions] };
  }
  return result as Record<ConfigurableOfficeAgentId, SpecialistDraft>;
}

function sameSpecialist(a: OfficeSpecialistConfiguration, b: SpecialistDraft): boolean {
  return (
    a.name === b.name &&
    a.function === b.function &&
    a.objective === b.objective &&
    a.instructions === b.instructions &&
    a.approvalPolicy === b.approvalPolicy &&
    a.allowedActions.length === b.allowedActions.length &&
    a.allowedActions.every((action) => b.allowedActions.includes(action))
  );
}

function seed(workspaceId: string, actorId: string) {
  const now = new Date().toISOString();
  const provisioned = provisionWorkspaceOffice(workspaceId, now);
  const configState = createOfficeConfigurationState(provisioned, actorId, now);
  return { provisioned, configState };
}

export type OfficeConfigurator = {
  provisioned: WorkspaceOfficeConfiguration;
  protectedSeats: WorkspaceOfficeSeat[];
  state: OfficeConfigurationState;
  officeNameDraft: string;
  setOfficeNameDraft: (name: string) => void;
  specialistDrafts: Record<ConfigurableOfficeAgentId, SpecialistDraft>;
  updateSpecialistDraft: (agentId: ConfigurableOfficeAgentId, patch: Partial<SpecialistDraft>) => void;
  resetSpecialistDraft: (agentId: ConfigurableOfficeAgentId) => void;
  specialistColors: Record<ConfigurableOfficeAgentId, string>;
  setSpecialistColor: (agentId: ConfigurableOfficeAgentId, color: string) => void;
  lastResult: OfficeConfigurationMutationResult | null;
  save: () => void;
  publish: () => void;
};

export function useOfficeConfigurator(
  workspaceId: string,
  actorId: string,
  actorRole: OfficeActorRole,
): OfficeConfigurator {
  const [{ provisioned, configState: initialConfigState }] = useState(() => seed(workspaceId, actorId));
  const [state, setState] = useState<OfficeConfigurationState>(initialConfigState);
  const [officeNameDraft, setOfficeNameDraft] = useState(initialConfigState.current.officeDisplayName);
  const [specialistDrafts, setSpecialistDrafts] = useState(() =>
    cloneSpecialistDrafts(initialConfigState.current.specialists),
  );
  const [lastResult, setLastResult] = useState<OfficeConfigurationMutationResult | null>(null);
  const [specialistColors, setSpecialistColors] = useState<Record<ConfigurableOfficeAgentId, string>>(() => {
    const result: Partial<Record<ConfigurableOfficeAgentId, string>> = {};
    for (const agentId of CONFIGURABLE_AGENT_IDS) result[agentId] = originalColor(agentId);
    return result as Record<ConfigurableOfficeAgentId, string>;
  });

  const protectedSeats = provisioned.seats.filter((seat) => seat.kind !== 'specialist');

  const setSpecialistColor = (agentId: ConfigurableOfficeAgentId, color: string) => {
    setSpecialistColors((prev) => ({ ...prev, [agentId]: color }));
  };

  const actor = (): OfficeViewer => ({ actorId, role: actorRole, workspaceId });

  const updateSpecialistDraft = (agentId: ConfigurableOfficeAgentId, patch: Partial<SpecialistDraft>) => {
    setSpecialistDrafts((prev) => ({ ...prev, [agentId]: { ...prev[agentId], ...patch } }));
  };

  const resetSpecialistDraft = (agentId: ConfigurableOfficeAgentId) => {
    const result = applyOfficeConfigurationCommand(state, {
      type: 'reset_specialist',
      workspaceId,
      expectedRevision: state.current.revision,
      actor: actor(),
      occurredAt: new Date().toISOString(),
      agentId,
    });
    setLastResult(result);
    if (result.success) {
      setState(result.state);
      setSpecialistDrafts(cloneSpecialistDrafts(result.state.current.specialists));
      setSpecialistColors((prev) => ({ ...prev, [agentId]: originalColor(agentId) }));
    }
  };

  const commitDrafts = (base: OfficeConfigurationState) => {
    let working = base;

    if (officeNameDraft.trim() !== working.current.officeDisplayName) {
      const result = applyOfficeConfigurationCommand(working, {
        type: 'update_office',
        workspaceId,
        expectedRevision: working.current.revision,
        actor: actor(),
        occurredAt: new Date().toISOString(),
        displayName: officeNameDraft,
      });
      if (!result.success) return { result, state: working };
      working = result.state;
    }

    for (const agentId of CONFIGURABLE_AGENT_IDS) {
      const draft = specialistDrafts[agentId];
      const current = working.current.specialists[agentId];
      if (sameSpecialist(current, draft)) continue;

      const result = applyOfficeConfigurationCommand(working, {
        type: 'update_specialist',
        workspaceId,
        expectedRevision: working.current.revision,
        actor: actor(),
        occurredAt: new Date().toISOString(),
        agentId,
        patch: draft,
      });
      if (!result.success) return { result, state: working };
      working = result.state;
    }

    return {
      result: { success: true, state: working } as OfficeConfigurationMutationResult,
      state: working,
    };
  };

  const syncDrafts = (next: OfficeConfigurationState) => {
    setOfficeNameDraft(next.current.officeDisplayName);
    setSpecialistDrafts(cloneSpecialistDrafts(next.current.specialists));
  };

  const save = () => {
    const committed = commitDrafts(state);
    setLastResult(committed.result);
    setState(committed.state);
    if (!committed.result.success) return;

    syncDrafts(committed.state);
  };

  const publish = () => {
    const committed = commitDrafts(state);
    if (!committed.result.success) {
      setLastResult(committed.result);
      setState(committed.state);
      return;
    }

    const result = applyOfficeConfigurationCommand(committed.state, {
      type: 'publish',
      workspaceId,
      expectedRevision: committed.state.current.revision,
      actor: actor(),
      occurredAt: new Date().toISOString(),
    });
    setLastResult(result);
    if (result.success) {
      setState(result.state);
      syncDrafts(result.state);
    }
  };

  return {
    provisioned,
    protectedSeats,
    state,
    officeNameDraft,
    setOfficeNameDraft,
    specialistDrafts,
    updateSpecialistDraft,
    resetSpecialistDraft,
    specialistColors,
    setSpecialistColor,
    lastResult,
    save,
    publish,
  };
}
