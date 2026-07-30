import { useEffect, useRef, useState } from 'react';
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
import { UNCONFIGURED_ORCHESTRATOR_ADAPTER, type OrchestratorAdapter, type OrchestratorAdapterCommand } from '../lib/orchestratorAdapter';

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

function createDemoOrchestratorState(workspaceId: string, actorEmail: string): CentralOrchestratorState {
  const occurredAt = new Date().toISOString();
  const actor = { actorId: actorEmail, role: 'workspace_admin' as const, workspaceId };
  let state = createCentralOrchestratorState(workspaceId, actorEmail);
  state = applyOrKeep(state, {
    type: 'orchestrator.openrouter_model_policy_updated', commandId: 'demo-model-policy', workspaceId, actor,
    occurredAt, expectedRevision: state.binding.revision, model: 'openai/gpt-4.1-mini',
    fallbackModel: 'anthropic/claude-3.5-haiku', costProfile: 'balanced', dailyRequestLimit: 500,
    monthlyRequestLimit: 12_000, allowPremiumModels: true,
  });
  state = applyOrKeep(state, {
    type: 'orchestrator.backend_status_reported', commandId: 'demo-backend-connected', workspaceId,
    actor: { actorId: 'demo-system', role: 'system', workspaceId }, occurredAt,
    expectedRevision: state.binding.revision, mode: 'openrouter', status: 'connected',
    statusDetail: 'Entorno de demostración preparado.', hasSecret: true,
  });
  state = applyOrKeep(state, {
    type: 'orchestrator.openrouter_agent_override_updated', commandId: 'demo-agent-override', workspaceId, actor,
    occurredAt, expectedRevision: state.binding.revision, agentId: 'review-qa',
    override: { model: 'anthropic/claude-3.7-sonnet', costProfile: 'premium', allowPremiumModels: true },
  });
  return state;
}

export type OrchestratorFeed = {
  binding: WorkspaceOrchestratorBinding;
  activeConfig: OpenRouterConfig | HermesTelegramConfig;
  /** True while the initial snapshot is being fetched from the backend. */
  loading: boolean;
  error: string | null;
  /** True while a dispatched command is being persisted to the backend. */
  saving: boolean;
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

/**
 * `adapter`/`enabled` mirror useOpenRouterConnectionFeed.ts exactly: `load()`
 * hydrates the persisted policy (with the REAL OpenRouter hasApiKey/status
 * signal already overlaid server-side — see orchestrator-service.ts) on
 * mount, and every dispatched command is both applied optimistically via the
 * pure reducer AND persisted through `send()`, reconciling on the backend's
 * authoritative response. `enabled` should be `isSuperAdmin` at the call
 * site (route.ts is requireSuperAdmin()-only), matching the sibling
 * connection feed's convention of skipping the fetch for everyone else
 * instead of an expected-but-noisy 403.
 */
export function useOrchestratorFeed(
  actorEmail: string,
  role: OrchestratorActorRole,
  workspaceId: string,
  demoMode = false,
  adapter: OrchestratorAdapter = UNCONFIGURED_ORCHESTRATOR_ADAPTER,
  enabled = true,
): OrchestratorFeed {
  const [state, setState] = useState<CentralOrchestratorState>(() => demoMode
    ? createDemoOrchestratorState(workspaceId, actorEmail)
    : createCentralOrchestratorState(workspaceId));
  const stateRef = useRef(state);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!demoMode && enabled);
  const actor = { actorId: actorEmail, role, workspaceId };

  const commitState = (next: CentralOrchestratorState) => {
    stateRef.current = next;
    setState(next);
  };

  // Hydrate from the backend's persisted binding on mount. OfficeVirtualApp
  // remounts this hook via key={workspaceId} on workspace switch, so a
  // mount-only effect never needs to react to workspaceId changing mid-life
  // (same reasoning as useOpenRouterConnectionFeed.ts).
  useEffect(() => {
    // `loading`'s initial value already accounts for demoMode/enabled (see
    // useState above), so the disabled case needs no synchronous setState
    // here — only the async fetch branch below ever needs to turn it off.
    if (demoMode || !enabled) return;
    let cancelled = false;
    adapter.load(workspaceId).then((result) => {
      if (cancelled) return;
      if (result.status === 'error') {
        setError(result.message);
        setLoading(false);
        return;
      }
      commitState({ ...stateRef.current, binding: result.binding });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, demoMode, enabled]);

  const dispatch = (build: (expectedRevision: number) => OrchestratorCommand) => {
    const command = build(stateRef.current.binding.revision);
    const result = applyOrchestratorCommand(stateRef.current, command);
    if (!result.success) {
      setError(result.code);
      return;
    }
    setError(null);
    commitState(result.state);

    if (demoMode || !enabled) return;

    const {
      commandId: _commandId,
      workspaceId: _workspaceId,
      actor: _actor,
      occurredAt: _occurredAt,
      expectedRevision: _expectedRevision,
      ...payload
    } = command;
    setSaving(true);
    adapter.send(workspaceId, command.expectedRevision, payload as OrchestratorAdapterCommand).then((sendResult) => {
      setSaving(false);
      if (sendResult.status === 'error') {
        setError(sendResult.message);
        return;
      }
      // The backend's binding is authoritative (it re-derives the real
      // OpenRouter signal and owns `revision`) — it supersedes the local
      // optimistic guess even if they happen to differ.
      commitState({ ...stateRef.current, binding: sendResult.binding });
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
    loading,
    error,
    saving,
    selectMode,
    updateOpenRouterConfig,
    updateHermesBotId,
    updateOpenRouterModelPolicy,
    updateAgentModelOverride,
    resolveModelForAgent,
    resolveExecutionForAgent,
  };
}
