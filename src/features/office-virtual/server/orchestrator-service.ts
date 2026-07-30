import {
  applyOrchestratorCommand,
  createCentralOrchestratorState,
  type CentralOrchestratorState,
  type OrchestratorActor,
  type OrchestratorCommand,
  type OrchestratorConnectionStatus,
  type WorkspaceOrchestratorBinding,
} from '../client/central-orchestrator';
import type { OpenRouterStatus } from '../client/central-integrations/real-integrations';

export type OrchestratorStore = {
  loadBinding(workspaceId: string): Promise<WorkspaceOrchestratorBinding | null>;
  saveBinding(
    workspaceId: string,
    binding: WorkspaceOrchestratorBinding,
    actorUserId: string | null,
  ): Promise<void>;
};

export type OrchestratorServicePorts = {
  store: OrchestratorStore;
  /** Live re-check against the real `integrations` table — never cached, never trusted from the client. */
  resolveRealOpenRouterStatus: (workspaceId: string) => Promise<OpenRouterStatus>;
  now?: () => string;
};

/**
 * Both "configured" and "verified" are enough to activate a specialist (see
 * real-integrations.ts's OPENROUTER_STATUS_ACTIVATES) — the Orquestador
 * treats them identically as "connected". "needs_attention" means the
 * integration row is enabled but has no API key, which is a real error for
 * the Orquestador (it cannot run at all), not just a softer "not configured".
 */
function mapRealOpenRouterStatus(real: OpenRouterStatus): {
  hasApiKey: boolean;
  status: OrchestratorConnectionStatus;
  statusDetail: string | null;
} {
  switch (real) {
    case 'not_configured':
      return { hasApiKey: false, status: 'not_configured', statusDetail: null };
    case 'needs_attention':
      return {
        hasApiKey: false,
        status: 'error',
        statusDetail: 'La integración de OpenRouter está activada pero no tiene una API key configurada.',
      };
    case 'configured':
    case 'verified':
      return { hasApiKey: true, status: 'connected', statusDetail: null };
  }
}

/**
 * Overlays the live OpenRouter signal onto a persisted (or freshly-created)
 * binding — never persisted itself, always recomputed. This is the fix for
 * the Orquestador showing "Bloqueado · Falta la API key en el backend" even
 * when Ajustes → Integraciones → OpenRouter is genuinely connected: before
 * this, `hasApiKey`/`status` only ever came from a client-only, always-blank
 * default (see useOrchestratorFeed.ts).
 */
function overlayRealOpenRouterStatus(
  binding: WorkspaceOrchestratorBinding,
  real: OpenRouterStatus,
): WorkspaceOrchestratorBinding {
  const mapped = mapRealOpenRouterStatus(real);
  return {
    ...binding,
    openrouter: {
      ...binding.openrouter,
      hasApiKey: mapped.hasApiKey,
      status: mapped.status,
      statusDetail: mapped.statusDetail,
    },
  };
}

async function loadBaseBinding(
  workspaceId: string,
  ports: OrchestratorServicePorts,
): Promise<WorkspaceOrchestratorBinding> {
  const persisted = await ports.store.loadBinding(workspaceId);
  return persisted ?? createCentralOrchestratorState(workspaceId).binding;
}

/** Loads the current policy with the real OpenRouter signal overlaid — safe to call on every page load. */
export async function loadOrchestratorBinding(
  workspaceId: string,
  ports: OrchestratorServicePorts,
): Promise<WorkspaceOrchestratorBinding> {
  const base = await loadBaseBinding(workspaceId, ports);
  const real = await ports.resolveRealOpenRouterStatus(workspaceId);
  return overlayRealOpenRouterStatus(base, real);
}

/** The 5 command types an admin (never `system`) can send from the client. */
export type OrchestratorCommandInput = Extract<
  OrchestratorCommand,
  {
    type:
      | 'orchestrator.mode_selected'
      | 'orchestrator.openrouter_config_updated'
      | 'orchestrator.openrouter_model_policy_updated'
      | 'orchestrator.openrouter_agent_override_updated'
      | 'orchestrator.hermes_bot_updated'
      | 'orchestrator.custom_instructions_updated';
  }
>;

// Plain `Omit<Union, K>` doesn't distribute over a discriminated union — it
// collapses to the intersection of member keys, losing every
// command-specific field (model, agentId, ...). A generic conditional type
// with a naked type parameter forces TypeScript to distribute it properly,
// so each variant keeps its own shape minus the 3 server-derived fields.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type HandleOrchestratorCommandInput = DistributiveOmit<
  OrchestratorCommandInput,
  'workspaceId' | 'actor' | 'occurredAt'
>;

export type HandleOrchestratorCommandResult =
  | { success: true; binding: WorkspaceOrchestratorBinding }
  | { success: false; code: string };

/**
 * Loads the current binding, applies one admin command via the pure reducer,
 * persists the result, then returns it with the real OpenRouter signal
 * overlaid. Command-id-based idempotency (`processedCommandIds` in the
 * reducer) is intentionally NOT persisted across requests — this table only
 * ever stores the current head, not a command log, so a retried request with
 * the same commandId is simply re-applied. Low-traffic superadmin-only
 * config screen, not a webhook, so double-submit is an acceptable risk here.
 */
export async function handleOrchestratorCommand(
  workspaceId: string,
  actor: OrchestratorActor,
  actorUserId: string | null,
  input: HandleOrchestratorCommandInput,
  ports: OrchestratorServicePorts,
): Promise<HandleOrchestratorCommandResult> {
  const base = await loadBaseBinding(workspaceId, ports);
  const occurredAt = ports.now?.() ?? new Date().toISOString();
  const state: CentralOrchestratorState = {
    workspaceId,
    binding: base,
    audit: [],
    processedCommandIds: [],
  };
  const command = { ...input, workspaceId, actor, occurredAt } as OrchestratorCommand;

  const result = applyOrchestratorCommand(state, command);
  if (!result.success) return { success: false, code: result.code };

  await ports.store.saveBinding(workspaceId, result.binding, actorUserId);
  const real = await ports.resolveRealOpenRouterStatus(workspaceId);
  return { success: true, binding: overlayRealOpenRouterStatus(result.binding, real) };
}
