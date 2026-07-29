import type { OfficeApprovalPolicy } from './configuration';
import type { SpecialistCapability, SpecialistTemplate } from './specialist-templates';
import type { SpecialistExtension } from './specialist-extensions';
import {
  resolveRequiredRealIntegrations,
  isRealIntegrationConnected,
  type ExecutionIntegrationId,
  type RealIntegrationStatusMap,
} from './real-integrations';

// A specialist's work splits into two tiers (product decision):
//
// 1. Intellectual capacity — draft, analyze, recommend, answer questions.
//    Needs only OpenRouter connected + the specialist published and
//    activated. Never blocked by a missing external tool.
// 2. Execution capacity — send, create appointments, touch a CRM, run a
//    webhook. Needs intellectual capacity PLUS the specific real
//    integration that action depends on.
//
// A specialist with zero external tools connected can still be activated
// and do real intellectual work — it just can't execute anything external
// yet. This module never returns a state that blocks activation because of
// a missing tool; only a missing OpenRouter connection blocks activation.

export const CAPABILITY_STATUSES = ['available', 'needs_approval', 'missing_connection', 'not_available'] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export type CapabilityReadiness = {
  capabilityId: string;
  label: string;
  /** No external connection needed at all — pure AI work (draft/analyze/recommend). */
  intellectualOnly: boolean;
  status: CapabilityStatus;
  /** Only set when status === 'missing_connection' — which real integration(s) to connect. */
  missingIntegrations: ExecutionIntegrationId[];
};

export type SpecialistDraftLike = {
  enabled: boolean;
  approvalPolicy: OfficeApprovalPolicy;
  name: string;
  function: string;
  objective: string;
  instructions: string;
};

function resolveCapabilityStatus(
  capability: SpecialistCapability,
  approvalPolicy: OfficeApprovalPolicy,
  realIntegrations: RealIntegrationStatusMap,
): CapabilityReadiness {
  const intellectualOnly = capability.requiredConnectionIds.length === 0;

  if (!intellectualOnly) {
    const { integrations, unsupported } = resolveRequiredRealIntegrations(capability.requiredConnectionIds);
    if (unsupported) {
      // At least one required connection has no real integration behind it
      // in this product (e.g. Gmail, an ERP, a PMS) — this specific action
      // can never run here, no matter what else gets connected. This is
      // never shown as something the admin should "go connect".
      return { capabilityId: capability.id, label: capability.label, intellectualOnly, status: 'not_available', missingIntegrations: [] };
    }
    const missing = integrations.filter((id) => !isRealIntegrationConnected(id, realIntegrations));
    if (missing.length > 0) {
      return { capabilityId: capability.id, label: capability.label, intellectualOnly, status: 'missing_connection', missingIntegrations: missing };
    }
  }

  if (capability.sensitive && approvalPolicy === 'always') {
    return { capabilityId: capability.id, label: capability.label, intellectualOnly, status: 'needs_approval', missingIntegrations: [] };
  }

  return { capabilityId: capability.id, label: capability.label, intellectualOnly, status: 'available', missingIntegrations: [] };
}

export const SPECIALIST_WORK_STATUSES = ['not_configured', 'needs_attention', 'ready_to_help', 'active'] as const;
export type SpecialistWorkStatus = (typeof SPECIALIST_WORK_STATUSES)[number];

export type SpecialistWorkSummary = {
  status: SpecialistWorkStatus;
  /** Plain-language reason, only set when status === 'needs_attention'. */
  attentionReason: string | null;
  /** Every capability, including "not_available" ones — internal metadata, never rendered directly in the normal card summary. */
  capabilities: CapabilityReadiness[];
  /** Intellectual-tier capabilities — always shown under "Ya puede ayudarte con". */
  intellectualCapabilities: CapabilityReadiness[];
  /** Execution-tier capabilities OnyxLink actually offers (excludes "not_available") — the only ones shown under "Acciones que ejecuta". */
  offeredExecutionCapabilities: CapabilityReadiness[];
  /** X of Y — counts ONLY offeredExecutionCapabilities. The 34 unimplemented generic connectors never appear in this ratio. */
  connectedCount: number;
  connectedTotal: number;
};

function hasValidBasicConfig(draft: Pick<SpecialistDraftLike, 'name' | 'function' | 'objective' | 'instructions'>): boolean {
  return Boolean(draft.name.trim() && draft.function.trim() && draft.objective.trim() && draft.instructions.trim());
}

/**
 * Computes what a specialist can and can't do right now. Capability
 * statuses are always computed as if the specialist were active — they
 * answer "what would work once this is turned on", exactly like the
 * top-level `status` separately answers "is it turned on".
 */
export function resolveSpecialistWorkSummary(
  template: SpecialistTemplate | null,
  draft: SpecialistDraftLike,
  openRouterConnected: boolean,
  realIntegrations: RealIntegrationStatusMap,
  installedExtensions: SpecialistExtension[] = [],
): SpecialistWorkSummary {
  if (!template) {
    return {
      status: 'not_configured',
      attentionReason: null,
      capabilities: [],
      intellectualCapabilities: [],
      offeredExecutionCapabilities: [],
      connectedCount: 0,
      connectedTotal: 0,
    };
  }

  const allCapabilities: SpecialistCapability[] = [...template.capabilities, ...installedExtensions.flatMap((extension) => extension.capabilities)];
  const capabilities = allCapabilities.map((capability) => resolveCapabilityStatus(capability, draft.approvalPolicy, realIntegrations));
  // "not_available" capabilities depend on a connector OnyxLink doesn't
  // offer at all (Gmail, an ERP...) — they're internal metadata from the
  // generic prototype catalog, never real functionality. Counting them
  // would make every specialist look permanently incomplete and would
  // shrink the X/Y ratio for something the product will never do. Only
  // capabilities OnyxLink actually offers (available/needs_approval/
  // missing_connection — i.e. backed by one of the 5 real integrations)
  // count toward "Funciones conectadas".
  const intellectualCapabilities = capabilities.filter((c) => c.intellectualOnly);
  const offeredExecutionCapabilities = capabilities.filter((c) => !c.intellectualOnly && c.status !== 'not_available');
  const connectedTotal = offeredExecutionCapabilities.length;
  const connectedCount = offeredExecutionCapabilities.filter((c) => c.status === 'available' || c.status === 'needs_approval').length;

  const configValid = hasValidBasicConfig(draft);

  let status: SpecialistWorkStatus;
  let attentionReason: string | null = null;

  if (!openRouterConnected) {
    status = 'needs_attention';
    attentionReason = 'Conecta OpenRouter en Ajustes → Integraciones para poder activarlo.';
  } else if (!configValid) {
    status = 'needs_attention';
    attentionReason = 'Completa nombre, función, objetivo e instrucciones para poder activarlo.';
  } else if (draft.enabled) {
    status = 'active';
  } else {
    status = 'ready_to_help';
  }

  return { status, attentionReason, capabilities, intellectualCapabilities, offeredExecutionCapabilities, connectedCount, connectedTotal };
}
