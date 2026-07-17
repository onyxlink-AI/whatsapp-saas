import type { AgentId } from '../../schemas';

// Per-workspace configuration of how the Orquestador actually runs.
//
// Two mutually exclusive modes:
// - 'openrouter': the office runs its own Coordinador locally, backed by an
//   LLM through OpenRouter.
// - 'hermes_telegram': Hermes *is* the Orquestador for this workspace. The
//   real flow is Telegram → Hermes → Oficina Virtual → especialistas/canales
//   → destino final. Telegram is only the channel the CEO uses to give
//   Hermes executive orders (input) and, when convenient, receive
//   confirmations/approval requests/summaries — it is never the required
//   destination for a result. A proposal, for example, can go through
//   Propuestas → QA → aprobación and end up sent to the client over WhatsApp
//   via YCloud, without ever routing back through Hermes/Telegram. See
//   COORDINACION_CLAUDE_CODEX.md for the connection roadmap.
//
// Nothing here is a real credential. `hasApiKey` / `hasSecret` are booleans
// only — the office backend is the sole owner of the actual token/API key,
// this contract structurally cannot carry one (see validation.ts, which
// rejects unknown fields such as `apiKey`/`token`/`secret` outright).
// `HermesTelegramConfig.endpoint` and `connectionId` follow the same rule even
// though they aren't secrets: they are bridge metadata the *backend* provisions
// and reports, never something an admin hand-types into this UI (see `botId`
// for the one field admins do type — which bot belongs to this workspace, not
// where it lives).

export type OrchestratorMode = 'openrouter' | 'hermes_telegram';

export type OrchestratorConnectionStatus =
  | 'not_configured' // no endpoint/model chosen yet
  | 'pending' // fields saved, never verified against a real backend
  | 'connected' // backend confirmed it's live and reachable
  | 'error'; // backend reported a problem (auth, timeout, misconfiguration)

export type OrchestratorActorRole = 'super_admin' | 'workspace_admin' | 'workspace_member' | 'system';

export type OrchestratorActor = {
  actorId: string;
  role: OrchestratorActorRole;
  workspaceId: string | null;
};

export type OpenRouterCostProfile = 'economy' | 'balanced' | 'premium';

export type OpenRouterAgentModelOverride = {
  model: string | null;
  fallbackModel: string | null;
  costProfile: OpenRouterCostProfile | null;
  dailyRequestLimit: number | null;
  monthlyRequestLimit: number | null;
  allowPremiumModels: boolean | null;
  updatedAt: string;
  updatedBy: string;
};

export type OpenRouterConfig = {
  mode: 'openrouter';
  /** Workspace default model. Kept as `model` for existing UI compatibility. */
  model: string | null;
  fallbackModel: string | null;
  costProfile: OpenRouterCostProfile;
  dailyRequestLimit: number | null;
  monthlyRequestLimit: number | null;
  allowPremiumModels: boolean;
  agentOverrides: Partial<Record<AgentId, OpenRouterAgentModelOverride>>;
  status: OrchestratorConnectionStatus;
  hasApiKey: boolean;
  statusDetail: string | null;
  updatedAt: string;
  updatedBy: string;
};

export type HermesTelegramConfig = {
  mode: 'hermes_telegram';
  /** Bridge address, provisioned and reported by the backend — never admin-entered, never a token. */
  endpoint: string | null;
  /** Opaque bridge connection id used to authenticate Hermes dispatches — never a token. */
  connectionId: string | null;
  /** Telegram bot handle/id (e.g. "@onyxlink_hermes_bot") the admin identifies — never the bot token. */
  botId: string | null;
  status: OrchestratorConnectionStatus;
  hasSecret: boolean;
  statusDetail: string | null;
  updatedAt: string;
  updatedBy: string;
};

export type WorkspaceOrchestratorBinding = {
  workspaceId: string;
  activeMode: OrchestratorMode;
  openrouter: OpenRouterConfig;
  hermesTelegram: HermesTelegramConfig;
  revision: number;
};

export type OrchestratorAuditAction =
  | 'mode_selected'
  | 'openrouter_config_updated'
  | 'openrouter_model_policy_updated'
  | 'openrouter_agent_override_updated'
  | 'hermes_bot_updated'
  | 'backend_status_reported';

export type OrchestratorAuditEntry = {
  commandId: string;
  workspaceId: string;
  action: OrchestratorAuditAction;
  actor: OrchestratorActor;
  occurredAt: string;
  revision: number;
  note: string | null;
};

export type CentralOrchestratorState = {
  workspaceId: string;
  binding: WorkspaceOrchestratorBinding;
  audit: OrchestratorAuditEntry[];
  processedCommandIds: string[];
};

type CommandBase = {
  commandId: string;
  workspaceId: string;
  actor: OrchestratorActor;
  occurredAt: string;
  expectedRevision: number;
};

export type OrchestratorCommand =
  | (CommandBase & { type: 'orchestrator.mode_selected'; mode: OrchestratorMode })
  | (CommandBase & { type: 'orchestrator.openrouter_config_updated'; model: string | null })
  | (CommandBase & {
      type: 'orchestrator.openrouter_model_policy_updated';
      model?: string | null;
      fallbackModel?: string | null;
      costProfile?: OpenRouterCostProfile;
      dailyRequestLimit?: number | null;
      monthlyRequestLimit?: number | null;
      allowPremiumModels?: boolean;
    })
  | (CommandBase & {
      type: 'orchestrator.openrouter_agent_override_updated';
      agentId: AgentId;
      override: {
        model?: string | null;
        fallbackModel?: string | null;
        costProfile?: OpenRouterCostProfile | null;
        dailyRequestLimit?: number | null;
        monthlyRequestLimit?: number | null;
        allowPremiumModels?: boolean | null;
      } | null;
    })
  // Admin-triggered: identifies *which* Telegram bot belongs to this
  // workspace. Never carries an endpoint — that's backend-provisioned.
  | (CommandBase & { type: 'orchestrator.hermes_bot_updated'; botId: string | null })
  // System-only: the backend reporting what it knows for one mode —
  // whether a secret/API key now exists, the resulting status, and (for
  // hermes_telegram) the bridge endpoint + opaque connection id it
  // provisioned. An admin actor can never send this command (see state.ts).
  | (CommandBase & {
      type: 'orchestrator.backend_status_reported';
      mode: OrchestratorMode;
      status: OrchestratorConnectionStatus;
      statusDetail: string | null;
      hasSecret: boolean;
      endpoint?: string | null;
      connectionId?: string | null;
    });

export type OrchestratorMutationErrorCode =
  | 'workspace_mismatch'
  | 'unauthorized'
  | 'stale_revision'
  | 'invalid_endpoint'
  | 'invalid_model_policy';

export type OrchestratorMutationResult =
  | { success: true; state: CentralOrchestratorState; binding: WorkspaceOrchestratorBinding; duplicate: boolean }
  | { success: false; code: OrchestratorMutationErrorCode };
