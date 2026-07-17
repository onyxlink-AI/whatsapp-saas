import type { AgentId } from '../../schemas';
import type {
  CentralOrchestratorState,
  HermesTelegramConfig,
  OpenRouterConfig,
  OpenRouterCostProfile,
  OrchestratorAuditEntry,
  WorkspaceOrchestratorBinding,
} from './types';

export function selectOrchestratorBinding(state: CentralOrchestratorState): WorkspaceOrchestratorBinding {
  return state.binding;
}

export function selectActiveOrchestratorConfig(state: CentralOrchestratorState): OpenRouterConfig | HermesTelegramConfig {
  return state.binding.activeMode === 'openrouter' ? state.binding.openrouter : state.binding.hermesTelegram;
}

export function selectOrchestratorAudit(state: CentralOrchestratorState, limit = 50): OrchestratorAuditEntry[] {
  return [...state.audit].slice(-limit).reverse();
}

export type ResolvedOpenRouterModel = {
  workspaceId: string;
  agentId: AgentId;
  model: string | null;
  fallbackModel: string | null;
  costProfile: OpenRouterCostProfile;
  dailyRequestLimit: number | null;
  monthlyRequestLimit: number | null;
  allowPremiumModels: boolean;
  source: 'workspace_default' | 'agent_override';
  ready: boolean;
  blockers: ('api_key_missing' | 'model_missing' | 'premium_not_allowed')[];
};

export type OpenRouterExecutionBlockerCode =
  | 'agent_not_openrouter_managed'
  | 'orchestrator_not_openrouter'
  | 'openrouter_not_connected'
  | ResolvedOpenRouterModel['blockers'][number];

export type ResolvedOpenRouterExecution = {
  model: ResolvedOpenRouterModel;
  ready: boolean;
  blockers: OpenRouterExecutionBlockerCode[];
};

export function selectOpenRouterModelForAgent(
  binding: WorkspaceOrchestratorBinding,
  agentId: AgentId,
): ResolvedOpenRouterModel {
  const base = binding.openrouter;
  const override = base.agentOverrides[agentId];
  const model = override?.model ?? base.model;
  const fallbackModel = override?.fallbackModel ?? base.fallbackModel;
  const costProfile = override?.costProfile ?? base.costProfile;
  const dailyRequestLimit = override?.dailyRequestLimit ?? base.dailyRequestLimit;
  const monthlyRequestLimit = override?.monthlyRequestLimit ?? base.monthlyRequestLimit;
  const allowPremiumModels = override?.allowPremiumModels ?? base.allowPremiumModels;
  const blockers: ResolvedOpenRouterModel['blockers'] = [];

  if (!base.hasApiKey) blockers.push('api_key_missing');
  if (!model) blockers.push('model_missing');
  if (costProfile === 'premium' && !allowPremiumModels) blockers.push('premium_not_allowed');

  return {
    workspaceId: binding.workspaceId,
    agentId,
    model,
    fallbackModel,
    costProfile,
    dailyRequestLimit,
    monthlyRequestLimit,
    allowPremiumModels,
    source: override ? 'agent_override' : 'workspace_default',
    ready: blockers.length === 0,
    blockers,
  };
}

export function selectOpenRouterExecutionForAgent(
  binding: WorkspaceOrchestratorBinding,
  agentId: AgentId,
): ResolvedOpenRouterExecution {
  const model = selectOpenRouterModelForAgent(binding, agentId);
  const blockers: OpenRouterExecutionBlockerCode[] = [];

  if (agentId === 'lead-intake' || agentId === 'strategy') blockers.push('agent_not_openrouter_managed');
  if (agentId === 'coordinator' && binding.activeMode !== 'openrouter') blockers.push('orchestrator_not_openrouter');
  if (binding.openrouter.status !== 'connected') blockers.push('openrouter_not_connected');
  blockers.push(...model.blockers);

  return { model, ready: blockers.length === 0, blockers };
}
