import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  OpenRouterConnectionBinding,
  OpenRouterConnectionKind,
  OpenRouterConnectionReport,
} from '../client/central-orchestration';
import { OpenRouterConnectionReportSchema } from '../client/central-orchestration';
import type { OfficeOpenRouterRequest } from '../openrouter-connection-contract';

const PERSISTED_KEY = 'office_virtual_openrouter';
const PersistedConnectionSchema = z.object({
  connectionId: z.string().trim().min(1).max(300),
  connectionKind: z.enum(['shared', 'dedicated']),
  status: z.enum(['connected', 'error', 'revoked']),
  statusDetail: z.string().trim().max(500).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
  updatedBy: z.string().trim().min(1).max(300),
  lastRequestId: z.string().trim().min(1).max(300).nullable(),
  lastReport: z.unknown().nullable(),
}).strict();

export type OpenRouterIntegrationRecord = {
  id: string | null;
  enabled: boolean;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};

export type OpenRouterConnectionStore = {
  load(workspaceId: string): Promise<OpenRouterIntegrationRecord | null>;
  saveConfig(workspaceId: string, config: Record<string, unknown>): Promise<void>;
};

export type OpenRouterCredentialVerifier = (
  apiKey: string,
) => Promise<{ success: true } | { success: false; detail: string }>;

export type OpenRouterConnectionServicePorts = {
  store: OpenRouterConnectionStore;
  platformApiKey: string;
  verifyCredential: OpenRouterCredentialVerifier;
  now?: () => string;
  createConnectionId?: () => string;
};

function persistedFrom(record: OpenRouterIntegrationRecord | null) {
  return PersistedConnectionSchema.safeParse(record?.config[PERSISTED_KEY]).data ?? null;
}

function workspaceApiKey(record: OpenRouterIntegrationRecord | null): string {
  if (!record?.enabled) return '';
  return record.credentials.openrouter_api_key?.trim() ?? '';
}

function apiKeyFor(
  kind: OpenRouterConnectionKind,
  record: OpenRouterIntegrationRecord | null,
  platformApiKey: string,
): string {
  return kind === 'dedicated' ? workspaceApiKey(record) : platformApiKey.trim();
}

function emptyBinding(workspaceId: string): OpenRouterConnectionBinding {
  return {
    workspaceId,
    connectionId: null,
    connectionKind: null,
    status: 'not_configured',
    pendingAction: null,
    pendingRequestId: null,
    hasCredential: false,
    statusDetail: null,
    updatedAt: new Date(0).toISOString(),
    updatedBy: 'system',
  };
}

export async function loadOfficeOpenRouterBinding(
  workspaceId: string,
  ports: OpenRouterConnectionServicePorts,
): Promise<OpenRouterConnectionBinding> {
  const record = await ports.store.load(workspaceId);
  const persisted = persistedFrom(record);
  if (!persisted) return emptyBinding(workspaceId);

  if (persisted.status === 'revoked') {
    return {
      workspaceId,
      connectionId: persisted.connectionId,
      connectionKind: persisted.connectionKind,
      status: 'revoked',
      pendingAction: null,
      pendingRequestId: null,
      hasCredential: false,
      statusDetail: persisted.statusDetail,
      updatedAt: persisted.updatedAt,
      updatedBy: persisted.updatedBy,
    };
  }

  const hasCredential = Boolean(apiKeyFor(persisted.connectionKind, record, ports.platformApiKey));
  const missingDetail = persisted.connectionKind === 'dedicated'
    ? 'La integracion OpenRouter del cliente no tiene una API key activa.'
    : 'La conexion OpenRouter de la plataforma no esta configurada.';

  return {
    workspaceId,
    connectionId: persisted.connectionId,
    connectionKind: persisted.connectionKind,
    status: hasCredential ? persisted.status : 'error',
    pendingAction: null,
    pendingRequestId: null,
    hasCredential,
    statusDetail: hasCredential ? persisted.statusDetail : missingDetail,
    updatedAt: persisted.updatedAt,
    updatedBy: persisted.updatedBy,
  };
}

function report(
  request: OfficeOpenRouterRequest,
  connectionId: string,
  connectionKind: OpenRouterConnectionKind,
  status: 'connected' | 'error' | 'revoked',
  hasCredential: boolean,
  statusDetail: string | null,
  occurredAt: string,
): OpenRouterConnectionReport {
  return {
    reportId: randomUUID(),
    requestId: request.requestId,
    workspaceId: request.workspaceId,
    connectionId,
    connectionKind,
    status,
    hasCredential,
    statusDetail,
    occurredAt,
  };
}

export type HandleOfficeOpenRouterResult =
  | { success: true; report: OpenRouterConnectionReport }
  | { success: false; code: 'connection_missing' | 'connection_mismatch' };

export async function handleOfficeOpenRouterRequest(
  request: OfficeOpenRouterRequest,
  actorId: string,
  ports: OpenRouterConnectionServicePorts,
): Promise<HandleOfficeOpenRouterResult> {
  const record = await ports.store.load(request.workspaceId);
  const persisted = persistedFrom(record);
  const previousReport = persisted?.lastRequestId === request.requestId
    ? OpenRouterConnectionReportSchema.safeParse(persisted.lastReport).data
    : null;

  if (previousReport?.requestId === request.requestId) {
    return { success: true, report: previousReport };
  }

  const occurredAt = ports.now?.() ?? new Date().toISOString();
  let connectionKind: OpenRouterConnectionKind;
  let connectionId: string;

  if (request.action.type === 'provision_connection') {
    connectionKind = request.action.connectionKind;
    connectionId = persisted && persisted.connectionKind === connectionKind && persisted.status !== 'revoked'
      ? persisted.connectionId
      : (ports.createConnectionId?.() ?? randomUUID());
  } else {
    if (!persisted) return { success: false, code: 'connection_missing' };
    if (persisted.connectionId !== request.action.connectionId) {
      return { success: false, code: 'connection_mismatch' };
    }
    connectionKind = persisted.connectionKind;
    connectionId = persisted.connectionId;
  }

  let resultReport: OpenRouterConnectionReport;
  if (request.action.type === 'revoke_connection') {
    resultReport = report(
      request,
      connectionId,
      connectionKind,
      'revoked',
      false,
      'Oficina Virtual desvinculada. La API key del panel del cliente no se ha eliminado.',
      occurredAt,
    );
  } else {
    const apiKey = apiKeyFor(connectionKind, record, ports.platformApiKey);
    if (!apiKey) {
      const detail = connectionKind === 'dedicated'
        ? 'Configura OpenRouter en el panel del cliente antes de conectarlo a Oficina Virtual.'
        : 'La API key central de OpenRouter no esta configurada en el backend.';
      resultReport = report(request, connectionId, connectionKind, 'error', false, detail, occurredAt);
    } else {
      const verified = await ports.verifyCredential(apiKey);
      resultReport = verified.success
        ? report(request, connectionId, connectionKind, 'connected', true, null, occurredAt)
        : report(request, connectionId, connectionKind, 'error', true, verified.detail, occurredAt);
    }
  }

  const nextConfig = {
    ...(record?.config ?? {}),
    [PERSISTED_KEY]: {
      connectionId,
      connectionKind,
      status: resultReport.status,
      statusDetail: resultReport.statusDetail,
      updatedAt: occurredAt,
      updatedBy: actorId,
      lastRequestId: request.requestId,
      lastReport: resultReport,
    },
  };
  await ports.store.saveConfig(request.workspaceId, nextConfig);
  return { success: true, report: resultReport };
}
