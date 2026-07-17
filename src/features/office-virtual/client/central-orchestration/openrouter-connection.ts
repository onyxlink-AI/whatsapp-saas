import { z } from 'zod';
import type { OrchestratorActor } from '../central-orchestrator';

export const OPENROUTER_CONNECTION_KINDS = ['shared', 'dedicated'] as const;
export type OpenRouterConnectionKind = (typeof OPENROUTER_CONNECTION_KINDS)[number];

export const OPENROUTER_CONNECTION_STATUSES = ['not_configured', 'pending', 'connected', 'error', 'revoked'] as const;
export type OpenRouterConnectionStatus = (typeof OPENROUTER_CONNECTION_STATUSES)[number];
export type OpenRouterConnectionPendingAction = 'connect' | 'verify' | 'revoke';

const IdentifierSchema = z.string().trim().min(1).max(300);
const DateTimeSchema = z.string().datetime({ offset: true });
const RequestBaseSchema = z.object({
  requestId: IdentifierSchema,
  workspaceId: IdentifierSchema,
  occurredAt: DateTimeSchema,
});

export const OpenRouterConnectionRequestSchema = z.discriminatedUnion('action', [
  RequestBaseSchema.extend({
    action: z.literal('connect'),
    connectionKind: z.enum(OPENROUTER_CONNECTION_KINDS),
  }).strict(),
  RequestBaseSchema.extend({ action: z.literal('verify') }).strict(),
  RequestBaseSchema.extend({ action: z.literal('revoke') }).strict(),
]);

export type OpenRouterConnectionRequest = z.infer<typeof OpenRouterConnectionRequestSchema>;

export const OpenRouterConnectionReportSchema = z
  .object({
    reportId: IdentifierSchema,
    requestId: IdentifierSchema,
    workspaceId: IdentifierSchema,
    connectionId: IdentifierSchema,
    connectionKind: z.enum(OPENROUTER_CONNECTION_KINDS),
    status: z.enum(['connected', 'error', 'revoked']),
    hasCredential: z.boolean(),
    statusDetail: z.string().trim().max(500).nullable().default(null),
    occurredAt: DateTimeSchema,
  })
  .strict()
  .superRefine((report, context) => {
    if (report.status === 'connected' && !report.hasCredential) {
      context.addIssue({ code: 'custom', path: ['hasCredential'], message: 'Connected reports require a backend credential.' });
    }
    if (report.status === 'revoked' && report.hasCredential) {
      context.addIssue({ code: 'custom', path: ['hasCredential'], message: 'Revoked reports cannot retain a backend credential.' });
    }
  });

export type OpenRouterConnectionReport = z.infer<typeof OpenRouterConnectionReportSchema>;

export type OpenRouterConnectionBinding = {
  workspaceId: string;
  connectionId: string | null;
  connectionKind: OpenRouterConnectionKind | null;
  status: OpenRouterConnectionStatus;
  pendingAction: OpenRouterConnectionPendingAction | null;
  pendingRequestId: string | null;
  hasCredential: boolean;
  statusDetail: string | null;
  updatedAt: string;
  updatedBy: string;
};

export type OpenRouterConnectionAuditEntry = {
  eventId: string;
  eventType: 'request' | 'report';
  workspaceId: string;
  actorId: string;
  action: OpenRouterConnectionPendingAction | null;
  status: OpenRouterConnectionStatus;
  occurredAt: string;
};

export type OpenRouterConnectionState = {
  workspaceId: string;
  binding: OpenRouterConnectionBinding;
  audit: OpenRouterConnectionAuditEntry[];
  processedRequestIds: string[];
  processedReportIds: string[];
};

export type OpenRouterConnectionBackendAction =
  | { type: 'provision_connection'; workspaceId: string; connectionKind: OpenRouterConnectionKind }
  | { type: 'verify_connection'; workspaceId: string; connectionId: string }
  | { type: 'revoke_connection'; workspaceId: string; connectionId: string };

export type OpenRouterConnectionRequestResult =
  | {
      status: 'accepted';
      request: OpenRouterConnectionRequest;
      state: OpenRouterConnectionState;
      backendAction: OpenRouterConnectionBackendAction;
    }
  | {
      status: 'duplicate';
      request: OpenRouterConnectionRequest;
      state: OpenRouterConnectionState;
      backendAction: null;
    }
  | {
      status: 'rejected';
      requestId: string | null;
      code:
        | 'invalid_connection_request'
        | 'workspace_mismatch'
        | 'unauthorized'
        | 'operation_in_progress'
        | 'connection_active'
        | 'connection_missing'
        | 'connection_revoked';
      issues?: { path: string; message: string }[];
    };

export type OpenRouterConnectionReportResult =
  | {
      status: 'accepted' | 'duplicate';
      report: OpenRouterConnectionReport;
      state: OpenRouterConnectionState;
    }
  | {
      status: 'rejected';
      reportId: string | null;
      code:
        | 'invalid_connection_report'
        | 'workspace_mismatch'
        | 'unauthorized'
        | 'report_without_request'
        | 'request_mismatch'
        | 'unexpected_report_status'
        | 'connection_kind_mismatch'
        | 'connection_mismatch';
      issues?: { path: string; message: string }[];
    };

const MAX_AUDIT = 2_000;
const MAX_PROCESSED_IDS = 2_000;

function validationIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '$',
    message: issue.message,
  }));
}

function idFrom(input: unknown, key: 'requestId' | 'reportId'): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function actorMatchesWorkspace(actor: OrchestratorActor, workspaceId: string): boolean {
  return actor.role === 'super_admin' || actor.workspaceId === workspaceId;
}

function appendAudit(
  state: OpenRouterConnectionState,
  entry: OpenRouterConnectionAuditEntry,
): OpenRouterConnectionAuditEntry[] {
  return [...state.audit, entry].slice(-MAX_AUDIT);
}

export function createOpenRouterConnectionState(workspaceId: string): OpenRouterConnectionState {
  const occurredAt = new Date(0).toISOString();
  return {
    workspaceId,
    binding: {
      workspaceId,
      connectionId: null,
      connectionKind: null,
      status: 'not_configured',
      pendingAction: null,
      pendingRequestId: null,
      hasCredential: false,
      statusDetail: null,
      updatedAt: occurredAt,
      updatedBy: 'system',
    },
    audit: [],
    processedRequestIds: [],
    processedReportIds: [],
  };
}

export function handleOpenRouterConnectionRequest(
  state: OpenRouterConnectionState,
  actor: OrchestratorActor,
  input: unknown,
): OpenRouterConnectionRequestResult {
  const parsed = OpenRouterConnectionRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'rejected',
      requestId: idFrom(input, 'requestId'),
      code: 'invalid_connection_request',
      issues: validationIssues(parsed.error),
    };
  }

  const request = parsed.data;
  if (request.workspaceId !== state.workspaceId) {
    return { status: 'rejected', requestId: request.requestId, code: 'workspace_mismatch' };
  }
  if (!actorMatchesWorkspace(actor, state.workspaceId) || !['super_admin', 'workspace_admin'].includes(actor.role)) {
    return { status: 'rejected', requestId: request.requestId, code: 'unauthorized' };
  }
  if (state.processedRequestIds.includes(request.requestId)) {
    return { status: 'duplicate', request, state, backendAction: null };
  }
  if (state.binding.pendingAction) {
    return { status: 'rejected', requestId: request.requestId, code: 'operation_in_progress' };
  }

  let backendAction: OpenRouterConnectionBackendAction;
  let connectionId = state.binding.connectionId;
  let connectionKind = state.binding.connectionKind;

  if (request.action === 'connect') {
    if (state.binding.status === 'connected') {
      return { status: 'rejected', requestId: request.requestId, code: 'connection_active' };
    }
    connectionId = null;
    connectionKind = request.connectionKind;
    backendAction = { type: 'provision_connection', workspaceId: state.workspaceId, connectionKind: request.connectionKind };
  } else {
    if (!connectionId || !connectionKind) {
      return { status: 'rejected', requestId: request.requestId, code: 'connection_missing' };
    }
    if (state.binding.status === 'revoked') {
      return { status: 'rejected', requestId: request.requestId, code: 'connection_revoked' };
    }
    backendAction = request.action === 'verify'
      ? { type: 'verify_connection', workspaceId: state.workspaceId, connectionId }
      : { type: 'revoke_connection', workspaceId: state.workspaceId, connectionId };
  }

  const binding: OpenRouterConnectionBinding = {
    ...state.binding,
    connectionId,
    connectionKind,
    status: 'pending',
    pendingAction: request.action,
    pendingRequestId: request.requestId,
    hasCredential: request.action === 'connect' ? false : state.binding.hasCredential,
    statusDetail: null,
    updatedAt: request.occurredAt,
    updatedBy: actor.actorId,
  };
  const nextState: OpenRouterConnectionState = {
    ...state,
    binding,
    audit: appendAudit(state, {
      eventId: request.requestId,
      eventType: 'request',
      workspaceId: state.workspaceId,
      actorId: actor.actorId,
      action: request.action,
      status: binding.status,
      occurredAt: request.occurredAt,
    }),
    processedRequestIds: [request.requestId, ...state.processedRequestIds].slice(0, MAX_PROCESSED_IDS),
  };

  return { status: 'accepted', request, state: nextState, backendAction };
}

export function applyOpenRouterConnectionReport(
  state: OpenRouterConnectionState,
  actor: OrchestratorActor,
  input: unknown,
): OpenRouterConnectionReportResult {
  const parsed = OpenRouterConnectionReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'rejected',
      reportId: idFrom(input, 'reportId'),
      code: 'invalid_connection_report',
      issues: validationIssues(parsed.error),
    };
  }

  const report = parsed.data;
  if (report.workspaceId !== state.workspaceId) {
    return { status: 'rejected', reportId: report.reportId, code: 'workspace_mismatch' };
  }
  if (actor.role !== 'system' || actor.workspaceId !== state.workspaceId) {
    return { status: 'rejected', reportId: report.reportId, code: 'unauthorized' };
  }
  if (state.processedReportIds.includes(report.reportId)) {
    return { status: 'duplicate', report, state };
  }
  if (!state.binding.pendingAction || !state.binding.pendingRequestId) {
    return { status: 'rejected', reportId: report.reportId, code: 'report_without_request' };
  }
  if (report.requestId !== state.binding.pendingRequestId) {
    return { status: 'rejected', reportId: report.reportId, code: 'request_mismatch' };
  }
  const expectedStatuses = state.binding.pendingAction === 'revoke'
    ? new Set(['revoked', 'error'])
    : new Set(['connected', 'error']);
  if (!expectedStatuses.has(report.status)) {
    return { status: 'rejected', reportId: report.reportId, code: 'unexpected_report_status' };
  }
  if (!state.binding.connectionKind) {
    return { status: 'rejected', reportId: report.reportId, code: 'report_without_request' };
  }
  if (report.connectionKind !== state.binding.connectionKind) {
    return { status: 'rejected', reportId: report.reportId, code: 'connection_kind_mismatch' };
  }
  if (state.binding.connectionId && report.connectionId !== state.binding.connectionId) {
    return { status: 'rejected', reportId: report.reportId, code: 'connection_mismatch' };
  }

  const binding: OpenRouterConnectionBinding = {
    ...state.binding,
    connectionId: report.connectionId,
    status: report.status,
    pendingAction: null,
    pendingRequestId: null,
    hasCredential: report.hasCredential,
    statusDetail: report.statusDetail,
    updatedAt: report.occurredAt,
    updatedBy: actor.actorId,
  };
  const nextState: OpenRouterConnectionState = {
    ...state,
    binding,
    audit: appendAudit(state, {
      eventId: report.reportId,
      eventType: 'report',
      workspaceId: state.workspaceId,
      actorId: actor.actorId,
      action: state.binding.pendingAction,
      status: report.status,
      occurredAt: report.occurredAt,
    }),
    processedReportIds: [report.reportId, ...state.processedReportIds].slice(0, MAX_PROCESSED_IDS),
  };

  return { status: 'accepted', report, state: nextState };
}
