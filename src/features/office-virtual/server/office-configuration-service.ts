import { randomUUID } from 'node:crypto';
import {
  applyOfficeConfigurationCommand,
  createOfficeConfigurationDocument,
  type OfficeConfigurationCommand,
  type OfficeConfigurationDocument,
  type OfficeConfigurationHistoryAction,
  type OfficeConfigurationMutationResult,
  type OfficeConfigurationStatus,
  type SpecialistPatch,
} from '../client/central-integrations/configuration';
import { provisionWorkspaceOffice } from '../client/central-integrations/preset';
import type { FixedOfficeSeatId, OfficeSeatId } from '../client/central-integrations/specialist-seats';
import type { VerticalId } from '../client/central-integrations/specialist-verticals';
import type { OfficeViewer } from '../client/central-integrations/types';

export type OfficeConfigurationHead = {
  presetId: string;
  presetVersion: string;
  revision: number;
  status: OfficeConfigurationStatus;
  document: OfficeConfigurationDocument;
  updatedAt: string;
  updatedBy: string;
};

export type OfficeConfigurationStore = {
  loadHead(workspaceId: string): Promise<OfficeConfigurationHead | null>;
  saveHead(workspaceId: string, head: OfficeConfigurationHead, actorUserId: string | null): Promise<void>;
  appendRevision(
    workspaceId: string,
    entry: {
      revision: number;
      action: OfficeConfigurationHistoryAction;
      actorUserId: string | null;
      actorEmail: string;
      sourceRevision: number | null;
      document: OfficeConfigurationDocument;
      occurredAt: string;
    },
  ): Promise<void>;
  loadRevisionDocument(workspaceId: string, revision: number): Promise<OfficeConfigurationDocument | null>;
};

export type OfficeConfigurationServicePorts = {
  store: OfficeConfigurationStore;
  /** Live re-check against the real `integrations` table — never cached, never trusted from the client. Only called for commands that actually need it. */
  resolveOpenRouterConnected: (workspaceId: string) => Promise<boolean>;
  now?: () => string;
};

/** Loads the current head, provisioning a fresh draft-1 document on first access. Never auto-publishes, never auto-activates anything. */
export async function loadOrProvisionOfficeConfiguration(
  workspaceId: string,
  actor: OfficeViewer,
  ports: OfficeConfigurationServicePorts,
): Promise<OfficeConfigurationHead> {
  const existing = await ports.store.loadHead(workspaceId);
  if (existing) return existing;

  const occurredAt = ports.now?.() ?? new Date().toISOString();
  const provisioned = provisionWorkspaceOffice(workspaceId, occurredAt);
  const document = createOfficeConfigurationDocument(provisioned, actor.actorId, occurredAt);
  const head: OfficeConfigurationHead = {
    presetId: document.presetId,
    presetVersion: document.presetVersion,
    revision: document.revision,
    status: document.status,
    document,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedBy,
  };

  await ports.store.saveHead(workspaceId, head, null);
  await ports.store.appendRevision(workspaceId, {
    revision: document.revision,
    action: 'provisioned',
    actorUserId: null,
    actorEmail: actor.actorId,
    sourceRevision: null,
    document,
    occurredAt,
  });

  return head;
}

/** Client-facing command shape — `sourceDocument` for `restore_revision` is fetched server-side, never supplied by the caller. */
export type OfficeConfigurationCommandInput =
  | { type: 'update_office'; expectedRevision: number; displayName: string }
  | { type: 'update_specialist'; expectedRevision: number; agentId: OfficeSeatId; patch: SpecialistPatch }
  | { type: 'reset_specialist'; expectedRevision: number; agentId: OfficeSeatId }
  | { type: 'update_core_seat_name'; expectedRevision: number; agentId: FixedOfficeSeatId; name: string | null }
  | { type: 'apply_vertical'; expectedRevision: number; verticalId: VerticalId | null }
  | { type: 'publish'; expectedRevision: number }
  | { type: 'restore_revision'; expectedRevision: number; revision: number };

export type HandleOfficeConfigurationCommandInput = OfficeConfigurationCommandInput & { requestId: string };

export type HandleOfficeConfigurationCommandResult =
  | { success: true; document: OfficeConfigurationDocument }
  | (Extract<OfficeConfigurationMutationResult, { success: false }> & { success: false });

/**
 * Loads the current head, applies one command via the pure reducer, and
 * persists both the new head and an immutable revision snapshot. The
 * reducer itself never touches the database — this is the only place that
 * does, so the reducer stays trivially unit-testable.
 */
export async function handleOfficeConfigurationCommand(
  workspaceId: string,
  actor: OfficeViewer,
  actorUserId: string | null,
  input: HandleOfficeConfigurationCommandInput,
  ports: OfficeConfigurationServicePorts,
): Promise<HandleOfficeConfigurationCommandResult> {
  const head = await loadOrProvisionOfficeConfiguration(workspaceId, actor, ports);
  const occurredAt = ports.now?.() ?? new Date().toISOString();

  const { requestId: _requestId, ...commandInput } = input;
  let command: OfficeConfigurationCommand;
  if (commandInput.type === 'restore_revision') {
    const sourceDocument = await ports.store.loadRevisionDocument(workspaceId, commandInput.revision);
    if (!sourceDocument) return { success: false, code: 'revision_mismatch' };
    command = { ...commandInput, workspaceId, actor, occurredAt, sourceDocument };
  } else if (commandInput.type === 'update_specialist') {
    const openRouterConnected = await ports.resolveOpenRouterConnected(workspaceId);
    command = { ...commandInput, workspaceId, actor, occurredAt, openRouterConnected };
  } else {
    command = { ...commandInput, workspaceId, actor, occurredAt };
  }

  const result = applyOfficeConfigurationCommand(head.document, command);
  if (!result.success) return result;

  const nextHead: OfficeConfigurationHead = {
    presetId: result.document.presetId,
    presetVersion: result.document.presetVersion,
    revision: result.document.revision,
    status: result.document.status,
    document: result.document,
    updatedAt: result.document.updatedAt,
    updatedBy: result.document.updatedBy,
  };

  await ports.store.saveHead(workspaceId, nextHead, actorUserId);
  await ports.store.appendRevision(workspaceId, {
    revision: result.document.revision,
    action: result.action,
    actorUserId,
    actorEmail: actor.actorId,
    sourceRevision: result.sourceRevision,
    document: result.document,
    occurredAt,
  });

  return { success: true, document: result.document };
}

export function createRequestId(): string {
  return randomUUID();
}
