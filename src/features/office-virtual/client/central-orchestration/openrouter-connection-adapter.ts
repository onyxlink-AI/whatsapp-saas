import { z } from 'zod';
import type { OrchestratorActor } from '../central-orchestrator';
import {
  applyOpenRouterConnectionReport,
  OPENROUTER_CONNECTION_KINDS,
  type OpenRouterConnectionBackendAction,
  type OpenRouterConnectionKind,
  type OpenRouterConnectionReport,
  type OpenRouterConnectionState,
} from './openrouter-connection';

const IdentifierSchema = z.string().trim().min(1).max(300);
const BackendActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('provision_connection'),
    workspaceId: IdentifierSchema,
    connectionKind: z.enum(OPENROUTER_CONNECTION_KINDS),
  }).strict(),
  z.object({
    type: z.literal('verify_connection'),
    workspaceId: IdentifierSchema,
    connectionId: IdentifierSchema,
  }).strict(),
  z.object({
    type: z.literal('revoke_connection'),
    workspaceId: IdentifierSchema,
    connectionId: IdentifierSchema,
  }).strict(),
]);

export const OpenRouterConnectionAdapterRequestSchema = z
  .object({
    requestId: IdentifierSchema,
    reportId: IdentifierSchema,
    workspaceId: IdentifierSchema,
    connectionKind: z.enum(OPENROUTER_CONNECTION_KINDS),
    action: BackendActionSchema,
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.action.workspaceId !== request.workspaceId) {
      context.addIssue({ code: 'custom', path: ['action', 'workspaceId'], message: 'Action workspace must match request workspace.' });
    }
    if (request.action.type === 'provision_connection' && request.action.connectionKind !== request.connectionKind) {
      context.addIssue({ code: 'custom', path: ['connectionKind'], message: 'Connection kind must match the provision action.' });
    }
  });

export type OpenRouterConnectionAdapterRequest = z.infer<typeof OpenRouterConnectionAdapterRequestSchema>;

export type OpenRouterManagedConnection = {
  connectionId: string;
  workspaceId: string;
  connectionKind: OpenRouterConnectionKind;
  credentialRef: string;
  status: 'active' | 'revoked';
};

export type OpenRouterConnectionRegistryPort = {
  provision: (input: {
    workspaceId: string;
    connectionKind: OpenRouterConnectionKind;
    idempotencyKey: string;
  }) => Promise<{ success: true; connection: OpenRouterManagedConnection } | { success: false; code: 'provision_failed' }>;
  findById: (connectionId: string) => Promise<OpenRouterManagedConnection | null>;
  markRevoked: (input: { connectionId: string; idempotencyKey: string }) => Promise<{ success: true } | { success: false; code: 'registry_unavailable' }>;
};

export type OpenRouterCredentialVaultPort = {
  hasCredential: (credentialRef: string) => Promise<boolean>;
  revokeCredential: (input: { credentialRef: string; idempotencyKey: string }) => Promise<
    { success: true } | { success: false; code: 'revocation_failed' }
  >;
};

export type OpenRouterGatewayPort = {
  verify: (input: {
    workspaceId: string;
    connectionId: string;
    credentialRef: string;
  }) => Promise<
    | { success: true }
    | { success: false; code: 'authentication_failed' | 'provider_unreachable' | 'rate_limited' }
  >;
};

export type OpenRouterConnectionAdapterPorts = {
  registry: OpenRouterConnectionRegistryPort;
  credentialVault: OpenRouterCredentialVaultPort;
  gateway: OpenRouterGatewayPort;
};

export type OpenRouterConnectionAdapterState = {
  workspaceId: string;
  reportsByRequestId: Record<string, OpenRouterConnectionReport>;
  requestOrder: string[];
};

export type OpenRouterConnectionAdapterResult =
  | {
      status: 'accepted' | 'duplicate';
      connectionState: OpenRouterConnectionState;
      adapterState: OpenRouterConnectionAdapterState;
      report: OpenRouterConnectionReport;
    }
  | {
      status: 'rejected';
      requestId: string | null;
      code:
        | 'invalid_adapter_request'
        | 'unauthorized'
        | 'workspace_mismatch'
        | 'connection_scope_mismatch'
        | 'connection_kind_mismatch'
        | 'connection_report_rejected';
      issues?: { path: string; message: string }[];
    }
  | {
      status: 'retryable_error';
      requestId: string;
      code: 'provision_failed' | 'registry_unavailable' | 'dependency_failure';
    };

const STATUS_DETAIL_ES = {
  connection_missing: 'No se encontró la conexión solicitada en el backend.',
  connection_revoked: 'La conexión ya está revocada en el backend.',
  credential_missing: 'La credencial no está disponible en el almacén seguro del backend.',
  authentication_failed: 'OpenRouter rechazó la credencial configurada.',
  provider_unreachable: 'No se pudo contactar con OpenRouter.',
  rate_limited: 'OpenRouter limitó temporalmente la verificación.',
  revocation_failed: 'No se pudo revocar la credencial en el almacén seguro.',
} as const;

type OperationalErrorCode = keyof typeof STATUS_DETAIL_ES;
const MAX_COMPLETED_REQUESTS = 2_000;

function validationIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '$',
    message: issue.message,
  }));
}

function requestIdFrom(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const value = (input as Record<string, unknown>).requestId;
  return typeof value === 'string' ? value : null;
}

function reportFor(
  request: OpenRouterConnectionAdapterRequest,
  connectionId: string,
  status: 'connected' | 'error' | 'revoked',
  hasCredential: boolean,
  statusDetail: string | null,
): OpenRouterConnectionReport {
  return {
    reportId: request.reportId,
    requestId: request.requestId,
    workspaceId: request.workspaceId,
    connectionId,
    connectionKind: request.connectionKind,
    status,
    hasCredential,
    statusDetail,
    occurredAt: request.occurredAt,
  };
}

function errorReport(
  request: OpenRouterConnectionAdapterRequest,
  connectionId: string,
  hasCredential: boolean,
  code: OperationalErrorCode,
): OpenRouterConnectionReport {
  return reportFor(request, connectionId, 'error', hasCredential, STATUS_DETAIL_ES[code]);
}

function validateConnectionScope(
  connection: OpenRouterManagedConnection,
  request: OpenRouterConnectionAdapterRequest,
): 'connection_scope_mismatch' | 'connection_kind_mismatch' | null {
  if (connection.workspaceId !== request.workspaceId) return 'connection_scope_mismatch';
  if (connection.connectionKind !== request.connectionKind) return 'connection_kind_mismatch';
  return null;
}

async function executeProvision(
  request: OpenRouterConnectionAdapterRequest,
  ports: OpenRouterConnectionAdapterPorts,
): Promise<OpenRouterConnectionReport | { retryable: 'provision_failed' | 'dependency_failure' } | { rejected: 'connection_scope_mismatch' | 'connection_kind_mismatch' }> {
  if (request.action.type !== 'provision_connection') return { retryable: 'dependency_failure' };
  const provisioned = await ports.registry.provision({
    workspaceId: request.workspaceId,
    connectionKind: request.connectionKind,
    idempotencyKey: request.requestId,
  });
  if (!provisioned.success) return { retryable: provisioned.code };

  const scopeError = validateConnectionScope(provisioned.connection, request);
  if (scopeError) return { rejected: scopeError };
  if (provisioned.connection.status === 'revoked') {
    return errorReport(request, provisioned.connection.connectionId, false, 'connection_revoked');
  }

  const hasCredential = await ports.credentialVault.hasCredential(provisioned.connection.credentialRef);
  if (!hasCredential) return errorReport(request, provisioned.connection.connectionId, false, 'credential_missing');

  const verified = await ports.gateway.verify({
    workspaceId: request.workspaceId,
    connectionId: provisioned.connection.connectionId,
    credentialRef: provisioned.connection.credentialRef,
  });
  if (!verified.success) return errorReport(request, provisioned.connection.connectionId, true, verified.code);
  return reportFor(request, provisioned.connection.connectionId, 'connected', true, null);
}

async function executeVerifyOrRevoke(
  request: OpenRouterConnectionAdapterRequest,
  ports: OpenRouterConnectionAdapterPorts,
): Promise<OpenRouterConnectionReport | { retryable: 'registry_unavailable' | 'dependency_failure' } | { rejected: 'connection_scope_mismatch' | 'connection_kind_mismatch' }> {
  if (request.action.type === 'provision_connection') return { retryable: 'dependency_failure' };
  const connection = await ports.registry.findById(request.action.connectionId);
  if (!connection) return errorReport(request, request.action.connectionId, false, 'connection_missing');

  const scopeError = validateConnectionScope(connection, request);
  if (scopeError) return { rejected: scopeError };
  if (connection.status === 'revoked') {
    return errorReport(request, connection.connectionId, false, 'connection_revoked');
  }

  const hasCredential = await ports.credentialVault.hasCredential(connection.credentialRef);
  if (request.action.type === 'verify_connection') {
    if (!hasCredential) return errorReport(request, connection.connectionId, false, 'credential_missing');
    const verified = await ports.gateway.verify({
      workspaceId: request.workspaceId,
      connectionId: connection.connectionId,
      credentialRef: connection.credentialRef,
    });
    if (!verified.success) return errorReport(request, connection.connectionId, true, verified.code);
    return reportFor(request, connection.connectionId, 'connected', true, null);
  }

  if (hasCredential) {
    const revoked = await ports.credentialVault.revokeCredential({
      credentialRef: connection.credentialRef,
      idempotencyKey: request.requestId,
    });
    if (!revoked.success) return errorReport(request, connection.connectionId, true, revoked.code);
  }
  const registryResult = await ports.registry.markRevoked({
    connectionId: connection.connectionId,
    idempotencyKey: request.requestId,
  });
  if (!registryResult.success) return { retryable: registryResult.code };
  return reportFor(request, connection.connectionId, 'revoked', false, null);
}

export function createOpenRouterConnectionAdapterState(workspaceId: string): OpenRouterConnectionAdapterState {
  return { workspaceId, reportsByRequestId: {}, requestOrder: [] };
}

export async function handleOpenRouterConnectionBackendAction(
  connectionState: OpenRouterConnectionState,
  adapterState: OpenRouterConnectionAdapterState,
  actor: OrchestratorActor,
  input: unknown,
  ports: OpenRouterConnectionAdapterPorts,
): Promise<OpenRouterConnectionAdapterResult> {
  const parsed = OpenRouterConnectionAdapterRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'rejected',
      requestId: requestIdFrom(input),
      code: 'invalid_adapter_request',
      issues: validationIssues(parsed.error),
    };
  }

  const request = parsed.data;
  if (request.workspaceId !== connectionState.workspaceId || request.workspaceId !== adapterState.workspaceId) {
    return { status: 'rejected', requestId: request.requestId, code: 'workspace_mismatch' };
  }
  if (actor.role !== 'system' || actor.workspaceId !== request.workspaceId) {
    return { status: 'rejected', requestId: request.requestId, code: 'unauthorized' };
  }
  const previousReport = adapterState.reportsByRequestId[request.requestId];
  if (previousReport) {
    return { status: 'duplicate', connectionState, adapterState, report: previousReport };
  }
  if (connectionState.binding.pendingRequestId !== request.requestId) {
    return { status: 'rejected', requestId: request.requestId, code: 'connection_report_rejected' };
  }

  try {
    const executed = request.action.type === 'provision_connection'
      ? await executeProvision(request, ports)
      : await executeVerifyOrRevoke(request, ports);
    if ('retryable' in executed) {
      return { status: 'retryable_error', requestId: request.requestId, code: executed.retryable };
    }
    if ('rejected' in executed) {
      return { status: 'rejected', requestId: request.requestId, code: executed.rejected };
    }

    const applied = applyOpenRouterConnectionReport(connectionState, actor, executed);
    if (applied.status === 'rejected') {
      return { status: 'rejected', requestId: request.requestId, code: 'connection_report_rejected' };
    }
    const requestOrder = [request.requestId, ...adapterState.requestOrder.filter((id) => id !== request.requestId)]
      .slice(0, MAX_COMPLETED_REQUESTS);
    const reportsByRequestId = Object.fromEntries(requestOrder.map((id) => [
      id,
      id === request.requestId ? executed : adapterState.reportsByRequestId[id],
    ]));
    const nextAdapterState: OpenRouterConnectionAdapterState = { ...adapterState, reportsByRequestId, requestOrder };
    return { status: 'accepted', connectionState: applied.state, adapterState: nextAdapterState, report: executed };
  } catch {
    return { status: 'retryable_error', requestId: request.requestId, code: 'dependency_failure' };
  }
}

export function buildOpenRouterConnectionAdapterRequest(
  action: OpenRouterConnectionBackendAction,
  connectionKind: OpenRouterConnectionKind,
  requestId: string,
  reportId: string,
  occurredAt: string,
): OpenRouterConnectionAdapterRequest {
  return {
    requestId,
    reportId,
    workspaceId: action.workspaceId,
    connectionKind,
    action,
    occurredAt,
  };
}
