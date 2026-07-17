import type { AgentId } from '../../schemas';
import type { WorkspaceOfficeConfiguration } from './preset';
import type { OfficeViewer } from './types';

export const OFFICE_SPECIALIST_ACTIONS = [
  'read_contacts',
  'read_memory',
  'draft_message',
  'send_message',
  'create_task',
  'update_pipeline',
  'schedule_call',
  'request_handoff',
] as const;

export type OfficeSpecialistAction = (typeof OFFICE_SPECIALIST_ACTIONS)[number];
export type OfficeApprovalPolicy = 'always' | 'sensitive_only' | 'never';
export type OfficeConfigurationStatus = 'draft' | 'published';
export type ConfigurableOfficeAgentId = 'proposal' | 'operations' | 'content' | 'review-qa';

export type OfficeSpecialistConfiguration = {
  agentId: ConfigurableOfficeAgentId;
  name: string;
  function: string;
  objective: string;
  instructions: string;
  allowedActions: OfficeSpecialistAction[];
  approvalPolicy: OfficeApprovalPolicy;
};

export type OfficeConfigurationDocument = {
  workspaceId: string;
  presetId: string;
  presetVersion: string;
  revision: number;
  status: OfficeConfigurationStatus;
  officeDisplayName: string;
  specialists: Record<ConfigurableOfficeAgentId, OfficeSpecialistConfiguration>;
  updatedAt: string;
  updatedBy: string;
};

export type OfficeConfigurationHistoryAction =
  | 'provisioned'
  | 'office_updated'
  | 'specialist_updated'
  | 'specialist_reset'
  | 'published'
  | 'revision_restored';

export type OfficeConfigurationHistoryEntry = {
  revision: number;
  action: OfficeConfigurationHistoryAction;
  actorId: string;
  occurredAt: string;
  sourceRevision: number | null;
  document: OfficeConfigurationDocument;
};

export type OfficeConfigurationState = {
  current: OfficeConfigurationDocument;
  history: OfficeConfigurationHistoryEntry[];
};

type CommandBase = {
  workspaceId: string;
  expectedRevision: number;
  actor: OfficeViewer;
  occurredAt: string;
};

export type OfficeConfigurationCommand =
  | (CommandBase & { type: 'update_office'; displayName: string })
  | (CommandBase & {
      type: 'update_specialist';
      agentId: AgentId;
      patch: Partial<Omit<OfficeSpecialistConfiguration, 'agentId'>>;
    })
  | (CommandBase & { type: 'reset_specialist'; agentId: AgentId })
  | (CommandBase & { type: 'publish' })
  | (CommandBase & { type: 'restore_revision'; revision: number });

export type OfficeConfigurationIssue = {
  field: string;
  message: string;
};

export type OfficeConfigurationMutationResult =
  | { success: true; state: OfficeConfigurationState }
  | {
      success: false;
      code:
        | 'unauthorized'
        | 'workspace_mismatch'
        | 'stale_revision'
        | 'unknown_specialist'
        | 'protected_seat'
        | 'revision_not_found'
        | 'invalid_configuration';
      issues?: OfficeConfigurationIssue[];
    };

const CONFIGURABLE_AGENT_IDS: ConfigurableOfficeAgentId[] = [
  'proposal',
  'operations',
  'content',
  'review-qa',
];

const PROTECTED_AGENT_IDS: AgentId[] = ['coordinator', 'lead-intake', 'strategy'];
const ACTION_SET = new Set<string>(OFFICE_SPECIALIST_ACTIONS);
const APPROVAL_POLICY_SET = new Set<string>(['always', 'sensitive_only', 'never']);

function cloneDocument(document: OfficeConfigurationDocument): OfficeConfigurationDocument {
  return {
    ...document,
    specialists: Object.fromEntries(
      Object.entries(document.specialists).map(([agentId, specialist]) => [
        agentId,
        { ...specialist, allowedActions: [...specialist.allowedActions] },
      ]),
    ) as OfficeConfigurationDocument['specialists'],
  };
}

function defaultSpecialist(
  agentId: ConfigurableOfficeAgentId,
  name: string,
): OfficeSpecialistConfiguration {
  return {
    agentId,
    name,
    function: 'Especialista configurable',
    objective: 'Adaptar este puesto a las necesidades del workspace.',
    instructions: 'Trabaja solo dentro de las acciones y aprobaciones configuradas.',
    allowedActions: ['read_contacts', 'read_memory', 'create_task', 'request_handoff'],
    approvalPolicy: 'sensitive_only',
  };
}

function appendRevision(
  state: OfficeConfigurationState,
  document: OfficeConfigurationDocument,
  action: OfficeConfigurationHistoryAction,
  actorId: string,
  occurredAt: string,
  sourceRevision: number | null = null,
): OfficeConfigurationState {
  const saved = cloneDocument(document);
  return {
    current: saved,
    history: [
      ...state.history,
      {
        revision: saved.revision,
        action,
        actorId,
        occurredAt,
        sourceRevision,
        document: cloneDocument(saved),
      },
    ],
  };
}

function validateText(
  issues: OfficeConfigurationIssue[],
  field: string,
  value: string,
  maxLength: number,
): void {
  const length = value.trim().length;
  if (length === 0) issues.push({ field, message: 'El campo es obligatorio.' });
  if (length > maxLength) {
    issues.push({ field, message: `El campo no puede superar ${maxLength} caracteres.` });
  }
}

export function validateOfficeConfiguration(
  document: OfficeConfigurationDocument,
): OfficeConfigurationIssue[] {
  const issues: OfficeConfigurationIssue[] = [];
  validateText(issues, 'officeDisplayName', document.officeDisplayName, 100);

  for (const agentId of CONFIGURABLE_AGENT_IDS) {
    const specialist = document.specialists[agentId];
    const prefix = `specialists.${agentId}`;
    if (!specialist) {
      issues.push({ field: prefix, message: 'Falta la configuración del especialista.' });
      continue;
    }
    validateText(issues, `${prefix}.name`, specialist.name, 80);
    validateText(issues, `${prefix}.function`, specialist.function, 160);
    validateText(issues, `${prefix}.objective`, specialist.objective, 500);
    validateText(issues, `${prefix}.instructions`, specialist.instructions, 4000);
    if (specialist.allowedActions.length === 0) {
      issues.push({ field: `${prefix}.allowedActions`, message: 'Selecciona al menos una acción.' });
    }
    if (new Set(specialist.allowedActions).size !== specialist.allowedActions.length) {
      issues.push({ field: `${prefix}.allowedActions`, message: 'No puede haber acciones duplicadas.' });
    }
    if (specialist.allowedActions.some((action) => !ACTION_SET.has(action))) {
      issues.push({ field: `${prefix}.allowedActions`, message: 'La configuración contiene una acción desconocida.' });
    }
    if (!APPROVAL_POLICY_SET.has(specialist.approvalPolicy)) {
      issues.push({ field: `${prefix}.approvalPolicy`, message: 'La política de aprobación no es válida.' });
    }
  }

  return issues;
}

export function createOfficeConfigurationState(
  provisioned: WorkspaceOfficeConfiguration,
  actorId: string,
  occurredAt: string,
): OfficeConfigurationState {
  const specialists = Object.fromEntries(
    CONFIGURABLE_AGENT_IDS.map((agentId) => {
      const seat = provisioned.seats.find((item) => item.agentId === agentId);
      return [agentId, defaultSpecialist(agentId, seat?.displayLabel ?? agentId)];
    }),
  ) as OfficeConfigurationDocument['specialists'];
  const document: OfficeConfigurationDocument = {
    workspaceId: provisioned.workspaceId,
    presetId: provisioned.presetId,
    presetVersion: provisioned.presetVersion,
    revision: 1,
    status: 'draft',
    officeDisplayName: provisioned.displayName,
    specialists,
    updatedAt: occurredAt,
    updatedBy: actorId,
  };

  return {
    current: cloneDocument(document),
    history: [
      {
        revision: 1,
        action: 'provisioned',
        actorId,
        occurredAt,
        sourceRevision: null,
        document: cloneDocument(document),
      },
    ],
  };
}

function specialistResult(
  state: OfficeConfigurationState,
  agentId: AgentId,
): OfficeConfigurationMutationResult | OfficeSpecialistConfiguration {
  if (PROTECTED_AGENT_IDS.includes(agentId)) return { success: false, code: 'protected_seat' };
  if (!CONFIGURABLE_AGENT_IDS.includes(agentId as ConfigurableOfficeAgentId)) {
    return { success: false, code: 'unknown_specialist' };
  }
  return state.current.specialists[agentId as ConfigurableOfficeAgentId];
}

export function applyOfficeConfigurationCommand(
  state: OfficeConfigurationState,
  command: OfficeConfigurationCommand,
): OfficeConfigurationMutationResult {
  if (command.actor.role !== 'onyxlink_super_admin') {
    return { success: false, code: 'unauthorized' };
  }
  if (command.workspaceId !== state.current.workspaceId) {
    return { success: false, code: 'workspace_mismatch' };
  }
  if (command.expectedRevision !== state.current.revision) {
    return { success: false, code: 'stale_revision' };
  }

  const next = cloneDocument(state.current);
  next.revision += 1;
  next.status = 'draft';
  next.updatedAt = command.occurredAt;
  next.updatedBy = command.actor.actorId;
  let action: OfficeConfigurationHistoryAction;
  let sourceRevision: number | null = null;

  if (command.type === 'update_office') {
    next.officeDisplayName = command.displayName.trim();
    action = 'office_updated';
  } else if (command.type === 'update_specialist') {
    const specialist = specialistResult(state, command.agentId);
    if ('success' in specialist) return specialist;
    next.specialists[specialist.agentId] = {
      ...specialist,
      ...command.patch,
      agentId: specialist.agentId,
      name: command.patch.name?.trim() ?? specialist.name,
      function: command.patch.function?.trim() ?? specialist.function,
      objective: command.patch.objective?.trim() ?? specialist.objective,
      instructions: command.patch.instructions?.trim() ?? specialist.instructions,
      allowedActions: command.patch.allowedActions
        ? [...command.patch.allowedActions]
        : [...specialist.allowedActions],
    };
    action = 'specialist_updated';
  } else if (command.type === 'reset_specialist') {
    const specialist = specialistResult(state, command.agentId);
    if ('success' in specialist) return specialist;
    const original = state.history[0]?.document.specialists[specialist.agentId];
    if (!original) return { success: false, code: 'unknown_specialist' };
    next.specialists[specialist.agentId] = {
      ...original,
      allowedActions: [...original.allowedActions],
    };
    action = 'specialist_reset';
  } else if (command.type === 'publish') {
    next.status = 'published';
    action = 'published';
  } else {
    const restored = state.history.find((entry) => entry.revision === command.revision);
    if (!restored) return { success: false, code: 'revision_not_found' };
    sourceRevision = restored.revision;
    next.officeDisplayName = restored.document.officeDisplayName;
    next.specialists = cloneDocument(restored.document).specialists;
    action = 'revision_restored';
  }

  const issues = validateOfficeConfiguration(next);
  if (issues.length > 0) return { success: false, code: 'invalid_configuration', issues };

  return {
    success: true,
    state: appendRevision(
      state,
      next,
      action,
      command.actor.actorId,
      command.occurredAt,
      sourceRevision,
    ),
  };
}
