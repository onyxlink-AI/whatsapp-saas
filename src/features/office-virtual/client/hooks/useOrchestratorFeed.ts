import { useState } from 'react';
import type { AgentId } from '../../schemas';
import {
  applyOrchestratorCommand,
  createCentralOrchestratorState,
  selectActiveOrchestratorConfig,
  selectOpenRouterExecutionForAgent,
  selectOpenRouterModelForAgent,
} from '../central-orchestrator';
import type {
  CentralOrchestratorState,
  HermesTelegramConfig,
  OpenRouterAgentModelOverride,
  OpenRouterConfig,
  OpenRouterCostProfile,
  ResolvedOpenRouterExecution,
  OrchestratorActorRole,
  OrchestratorCommand,
  OrchestratorMode,
  ResolvedOpenRouterModel,
  WorkspaceOrchestratorBinding,
} from '../central-orchestrator';

export type ModelPolicyPatch = Partial<{
  model: string | null;
  fallbackModel: string | null;
  costProfile: OpenRouterCostProfile;
  dailyRequestLimit: number | null;
  monthlyRequestLimit: number | null;
  allowPremiumModels: boolean;
}>;

export type AgentOverridePatch = Partial<Omit<OpenRouterAgentModelOverride, 'updatedAt' | 'updatedBy'>>;

function applyOrKeep(state: CentralOrchestratorState, command: OrchestratorCommand): CentralOrchestratorState {
  const result = applyOrchestratorCommand(state, command);
  return result.success ? result.state : state;
}

export type OrchestratorFeed = {
  binding: WorkspaceOrchestratorBinding;
  activeConfig: OpenRouterConfig | HermesTelegramConfig;
  loading: boolean;
  error: string | null;
  selectMode: (mode: OrchestratorMode) => void;
  updateOpenRouterConfig: (model: string | null) => void;
  /** Only the bot identifier — the bridge endpoint is backend-provisioned, never admin-entered. */
  updateHermesBotId: (botId: string | null) => void;
  /** Workspace-wide OpenRouter defaults (model, fallback, cost profile, limits) — no API key field, no real call. */
  updateOpenRouterModelPolicy: (patch: ModelPolicyPatch) => void;
  /** Per-seat override; pass `null` to clear it and fall back to the workspace policy. */
  updateAgentModelOverride: (agentId: AgentId, patch: AgentOverridePatch | null) => void;
  /** Resolved model + readiness for one seat (workspace default vs. its own override) — pure derivation, no network. */
  resolveModelForAgent: (agentId: AgentId) => ResolvedOpenRouterModel;
  /** Full local preflight status, including active mode and backend connection state. */
  resolveExecutionForAgent: (agentId: AgentId) => ResolvedOpenRouterExecution;
};

export function useOrchestratorFeed(actorEmail: string, role: OrchestratorActorRole, workspaceId: string): OrchestratorFeed {
  // Honestly empty — no real orchestrator backend is wired yet, so this no
  // longer seeds a fake "already configured" model policy (see
  // useTaskFeed.ts for the same pattern). createCentralOrchestratorState's
  // own default (activeMode 'openrouter', blank configs) IS the correct
  // "not configured yet" state, not a placeholder needing a fixture on top.
  const [state, setState] = useState<CentralOrchestratorState>(() => createCentralOrchestratorState(workspaceId));
  const [error, setError] = useState<string | null>(null);
  const actor = { actorId: actorEmail, role, workspaceId };

  const dispatch = (build: (expectedRevision: number) => OrchestratorCommand) => {
    setState((previous) => {
      const result = applyOrchestratorCommand(previous, build(previous.binding.revision));
      if (!result.success) {
        setError(result.code);
        return previous;
      }
      setError(null);
      return result.state;
    });
  };

  const selectMode = (mode: OrchestratorMode) =>
    dispatch((expectedRevision) => ({
      type: 'orchestrator.mode_selected', commandId: crypto.randomUUID(), workspaceId, actor,
      occurredAt: new Date().toISOString(), expectedRevision, mode,
    }));

  const updateOpenRouterConfig = (model: string | null) =>
    dispatch((expectedRevision) => ({
      type: 'orchestrator.openrouter_config_updated', commandId: crypto.randomUUID(), workspaceId, actor,
      occurredAt: new Date().toISOString(), expectedRevision, model,
    }));

  const updateHermesBotId = (botId: string | null) =>
    dispatch((expectedRevision) => ({
      type: 'orchestrator.hermes_bot_updated', commandId: crypto.randomUUID(), workspaceId, actor,
      occurredAt: new Date().toISOString(), expectedRevision, botId,
    }));

  const updateOpenRouterModelPolicy = (patch: ModelPolicyPatch) =>
    dispatch((expectedRevision) => ({
      type: 'orchestrator.openrouter_model_policy_updated', commandId: crypto.randomUUID(), workspaceId, actor,
      occurredAt: new Date().toISOString(), expectedRevision, ...patch,
    }));

  const updateAgentModelOverride = (agentId: AgentId, patch: AgentOverridePatch | null) =>
    dispatch((expectedRevision) => ({
      type: 'orchestrator.openrouter_agent_override_updated', commandId: crypto.randomUUID(), workspaceId, actor,
      occurredAt: new Date().toISOString(), expectedRevision, agentId, override: patch,
    }));

  const resolveModelForAgent = (agentId: AgentId) => selectOpenRouterModelForAgent(state.binding, agentId);
  const resolveExecutionForAgent = (agentId: AgentId) => selectOpenRouterExecutionForAgent(state.binding, agentId);

  return {
    binding: state.binding,
    activeConfig: selectActiveOrchestratorConfig(state),
    loading: false,
    error,
    selectMode,
    updateOpenRouterConfig,
    updateHermesBotId,
    updateOpenRouterModelPolicy,
    updateAgentModelOverride,
    resolveModelForAgent,
    resolveExecutionForAgent,
  };
}
