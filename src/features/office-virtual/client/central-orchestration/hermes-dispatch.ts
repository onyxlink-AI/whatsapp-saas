import { z } from 'zod';
import type { AgentId } from '../../schemas';
import type {
  OfficeConfigurationDocument,
  OfficeSpecialistAction,
  OfficeSpecialistConfiguration,
} from '../central-integrations/configuration';
import { OFFICE_SPECIALIST_ACTIONS } from '../central-integrations/configuration';
import { applyTaskCommand } from '../central-tasks';
import type { CentralTask, CentralTaskState, TaskPriority } from '../central-tasks';
import type { WorkspaceOrchestratorBinding } from '../central-orchestrator';

export const HERMES_DISPATCH_AGENT_IDS = ['proposal', 'operations', 'content', 'review-qa'] as const;
export type HermesDispatchAgentId = (typeof HERMES_DISPATCH_AGENT_IDS)[number];
export const HERMES_COMMAND_CHANNELS = ['telegram_private', 'telegram_group', 'voice'] as const;
export type HermesCommandChannel = (typeof HERMES_COMMAND_CHANNELS)[number];

const SENSITIVE_ACTIONS = new Set<OfficeSpecialistAction>([
  'send_message',
  'update_pipeline',
  'schedule_call',
]);

const IdentifierSchema = z.string().trim().min(1).max(200);
const TextSchema = z.string().trim().min(1).max(4_000);

export const HermesSpecialistDispatchSchema = z
  .object({
    dispatchId: IdentifierSchema,
    workspaceId: IdentifierSchema,
    connectionId: IdentifierSchema,
    commandChannel: z.enum(HERMES_COMMAND_CHANNELS).default('telegram_private'),
    conversationId: IdentifierSchema,
    targetAgentId: z.enum(HERMES_DISPATCH_AGENT_IDS),
    title: z.string().trim().min(1).max(200),
    instructions: TextSchema,
    requestedActions: z.array(z.enum(OFFICE_SPECIALIST_ACTIONS)).max(20),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    contactId: IdentifierSchema.nullable().default(null),
    requiresHumanApproval: z.boolean().default(false),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type HermesSpecialistDispatch = z.infer<typeof HermesSpecialistDispatchSchema>;

export type AuthenticatedHermesBinding = {
  connectionId: string;
  workspaceId: string;
  enabled: boolean;
};

export type ResolveHermesDispatchBindingResult =
  | { success: true; binding: AuthenticatedHermesBinding }
  | {
      success: false;
      code:
        | 'orchestrator_not_hermes'
        | 'hermes_not_connected'
        | 'hermes_secret_missing'
        | 'hermes_endpoint_missing'
        | 'hermes_connection_missing'
        | 'workspace_mismatch';
    };

export type HermesDispatchReceipt = {
  dispatchId: string;
  workspaceId: string;
  commandChannel: HermesCommandChannel;
  conversationId: string;
  taskId: string;
  targetAgentId: HermesDispatchAgentId;
  status: 'accepted';
  approvalRequired: boolean;
};

export type MaterializeHermesDispatchResult =
  | {
      success: true;
      state: CentralTaskState;
      task: CentralTask;
      receipt: HermesDispatchReceipt;
      duplicate: boolean;
    }
  | {
      success: false;
      code:
        | 'invalid_dispatch'
        | 'connection_disabled'
        | 'connection_mismatch'
        | 'workspace_mismatch'
        | 'configuration_not_published'
        | 'ineligible_agent'
        | 'action_not_allowed'
        | 'task_creation_failed';
      issues?: { path: string; message: string }[];
    };

export type AcceptHermesSpecialistDispatchResult =
  | MaterializeHermesDispatchResult
  | {
      success: false;
      code:
        | 'orchestrator_not_hermes'
        | 'hermes_not_connected'
        | 'hermes_secret_missing'
        | 'hermes_endpoint_missing'
        | 'hermes_connection_missing'
        | 'workspace_mismatch';
    };

export const HermesBridgeRequestSchema = z
  .object({
    requestId: IdentifierSchema,
    authenticatedConnectionId: IdentifierSchema,
    receivedAt: z.string().datetime({ offset: true }),
    dispatch: z.unknown(),
  })
  .strict();

export type HermesBridgeRequest = z.infer<typeof HermesBridgeRequestSchema>;

export type HermesBridgeResponse =
  | {
      status: 'accepted' | 'duplicate';
      requestId: string;
      receipt: HermesDispatchReceipt;
      task: CentralTask;
      state: CentralTaskState;
    }
  | {
      status: 'rejected';
      requestId: string | null;
      code:
        | 'invalid_bridge_request'
        | 'connection_mismatch'
        | 'orchestrator_not_hermes'
        | 'hermes_not_connected'
        | 'hermes_secret_missing'
        | 'hermes_endpoint_missing'
        | 'hermes_connection_missing'
        | 'workspace_mismatch'
        | 'invalid_dispatch'
        | 'connection_disabled'
        | 'configuration_not_published'
        | 'ineligible_agent'
        | 'action_not_allowed'
        | 'task_creation_failed';
      issues?: { path: string; message: string }[];
    };

export const HERMES_BRIDGE_RESULT_KINDS = ['confirmation', 'approval_request', 'summary'] as const;
export type HermesBridgeResultKind = (typeof HERMES_BRIDGE_RESULT_KINDS)[number];
export type HermesBridgeResultDeliveryStatus = 'accepted' | 'rejected';

export const HermesBridgeResultEventSchema = z
  .object({
    eventId: IdentifierSchema,
    workspaceId: IdentifierSchema,
    connectionId: IdentifierSchema,
    dispatchId: IdentifierSchema,
    conversationId: IdentifierSchema,
    taskId: IdentifierSchema,
    commandChannel: z.enum(HERMES_COMMAND_CHANNELS),
    kind: z.enum(HERMES_BRIDGE_RESULT_KINDS),
    deliveryStatus: z.enum(['accepted', 'rejected']),
    note: z.string().trim().max(1_000).nullable().default(null),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type HermesBridgeResultEvent = z.infer<typeof HermesBridgeResultEventSchema>;

export type HermesBridgeResultState = {
  workspaceId: string;
  events: HermesBridgeResultEvent[];
  processedEventIds: string[];
};

export type HermesBridgeResultEventResponse =
  | {
      status: 'accepted' | 'duplicate';
      state: HermesBridgeResultState;
      event: HermesBridgeResultEvent;
    }
  | {
      status: 'rejected';
      code:
        | 'invalid_result_event'
        | 'workspace_mismatch'
        | 'connection_mismatch'
        | 'task_not_found';
      issues?: { path: string; message: string }[];
    };

export type HermesBridgeDispatchStatus =
  | {
      status: 'found';
      dispatchId: string;
      workspaceId: string;
      commandChannel: HermesCommandChannel;
      conversationId: string;
      taskId: string;
      taskStatus: CentralTask['status'];
      approvalRequired: boolean;
      approvalStatus: CentralTask['approvalStatus'];
      updatedAt: string;
    }
  | {
      status: 'not_found' | 'workspace_mismatch';
      dispatchId: string;
      workspaceId: string;
      taskId: string;
    };

const MAX_BRIDGE_RESULT_EVENTS = 2_000;
const MAX_BRIDGE_RESULT_IDS = 2_000;

function taskIdForDispatch(dispatchId: string): string {
  return `hermes-dispatch-task:${dispatchId}`;
}

function validationIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '$',
    message: issue.message,
  }));
}

export function resolveHermesDispatchBinding(
  orchestrator: WorkspaceOrchestratorBinding,
  workspaceId: string,
): ResolveHermesDispatchBindingResult {
  if (orchestrator.workspaceId !== workspaceId) return { success: false, code: 'workspace_mismatch' };
  if (orchestrator.activeMode !== 'hermes_telegram') return { success: false, code: 'orchestrator_not_hermes' };

  const hermes = orchestrator.hermesTelegram;
  if (hermes.status !== 'connected') return { success: false, code: 'hermes_not_connected' };
  if (!hermes.hasSecret) return { success: false, code: 'hermes_secret_missing' };
  if (!hermes.endpoint) return { success: false, code: 'hermes_endpoint_missing' };
  if (!hermes.connectionId) return { success: false, code: 'hermes_connection_missing' };

  return {
    success: true,
    binding: {
      connectionId: hermes.connectionId,
      workspaceId: orchestrator.workspaceId,
      enabled: true,
    },
  };
}

function requiresApproval(
  specialist: OfficeSpecialistConfiguration,
  dispatch: HermesSpecialistDispatch,
): boolean {
  if (dispatch.requiresHumanApproval || specialist.approvalPolicy === 'always') return true;
  return specialist.approvalPolicy === 'sensitive_only'
    && dispatch.requestedActions.some((action) => SENSITIVE_ACTIONS.has(action));
}

function specialistFor(
  configuration: OfficeConfigurationDocument,
  agentId: AgentId,
): OfficeSpecialistConfiguration | null {
  if (!HERMES_DISPATCH_AGENT_IDS.includes(agentId as HermesDispatchAgentId)) return null;
  return configuration.specialists[agentId as HermesDispatchAgentId] ?? null;
}

export function materializeHermesDispatchTask(
  taskState: CentralTaskState,
  configuration: OfficeConfigurationDocument,
  binding: AuthenticatedHermesBinding,
  input: unknown,
): MaterializeHermesDispatchResult {
  const parsed = HermesSpecialistDispatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: 'invalid_dispatch',
      issues: validationIssues(parsed.error),
    };
  }
  const dispatch = parsed.data;

  if (!binding.enabled) return { success: false, code: 'connection_disabled' };
  if (binding.connectionId !== dispatch.connectionId) return { success: false, code: 'connection_mismatch' };
  if (
    dispatch.workspaceId !== binding.workspaceId
    || dispatch.workspaceId !== taskState.workspaceId
    || dispatch.workspaceId !== configuration.workspaceId
  ) {
    return { success: false, code: 'workspace_mismatch' };
  }
  if (configuration.status !== 'published') {
    return { success: false, code: 'configuration_not_published' };
  }

  const specialist = specialistFor(configuration, dispatch.targetAgentId);
  if (!specialist) return { success: false, code: 'ineligible_agent' };
  if (dispatch.requestedActions.some((action) => !specialist.allowedActions.includes(action))) {
    return { success: false, code: 'action_not_allowed' };
  }

  const approvalRequired = requiresApproval(specialist, dispatch);
  const taskId = taskIdForDispatch(dispatch.dispatchId);
  const taskResult = applyTaskCommand(taskState, {
    type: 'task.created',
    commandId: `hermes-dispatch-created:${dispatch.dispatchId}`,
    taskId,
    workspaceId: dispatch.workspaceId,
    actor: { actorId: `hermes:${binding.connectionId}`, role: 'system' },
    occurredAt: dispatch.occurredAt,
    title: dispatch.title,
    description: dispatch.instructions,
    priority: dispatch.priority as TaskPriority,
    source: 'automation',
    assignedAgentId: dispatch.targetAgentId,
    contactId: dispatch.contactId,
    requiresApproval: approvalRequired,
  });
  if (!taskResult.success) return { success: false, code: 'task_creation_failed' };

  return {
    success: true,
    state: taskResult.state,
    task: taskResult.task,
    receipt: {
      dispatchId: dispatch.dispatchId,
      workspaceId: dispatch.workspaceId,
      commandChannel: dispatch.commandChannel,
      conversationId: dispatch.conversationId,
      taskId,
      targetAgentId: dispatch.targetAgentId,
      status: 'accepted',
      approvalRequired,
    },
    duplicate: taskResult.duplicate,
  };
}

export function acceptHermesSpecialistDispatch(
  taskState: CentralTaskState,
  configuration: OfficeConfigurationDocument,
  orchestrator: WorkspaceOrchestratorBinding,
  input: unknown,
): AcceptHermesSpecialistDispatchResult {
  const binding = resolveHermesDispatchBinding(orchestrator, taskState.workspaceId);
  if (!binding.success) return binding;
  return materializeHermesDispatchTask(taskState, configuration, binding.binding, input);
}

export function handleHermesBridgeRequest(
  taskState: CentralTaskState,
  configuration: OfficeConfigurationDocument,
  orchestrator: WorkspaceOrchestratorBinding,
  input: unknown,
): HermesBridgeResponse {
  const parsed = HermesBridgeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'rejected',
      requestId: typeof input === 'object' && input !== null && 'requestId' in input && typeof input.requestId === 'string'
        ? input.requestId
        : null,
      code: 'invalid_bridge_request',
      issues: validationIssues(parsed.error),
    };
  }

  const request = parsed.data;
  const dispatch = HermesSpecialistDispatchSchema.safeParse(request.dispatch);
  if (!dispatch.success) {
    return {
      status: 'rejected',
      requestId: request.requestId,
      code: 'invalid_dispatch',
      issues: validationIssues(dispatch.error),
    };
  }

  if (request.authenticatedConnectionId !== dispatch.data.connectionId) {
    return { status: 'rejected', requestId: request.requestId, code: 'connection_mismatch' };
  }

  const accepted = acceptHermesSpecialistDispatch(taskState, configuration, orchestrator, dispatch.data);
  if (!accepted.success) {
    return {
      status: 'rejected',
      requestId: request.requestId,
      code: accepted.code,
      ...('issues' in accepted && accepted.issues ? { issues: accepted.issues } : {}),
    };
  }

  return {
    status: accepted.duplicate ? 'duplicate' : 'accepted',
    requestId: request.requestId,
    receipt: accepted.receipt,
    task: accepted.task,
    state: accepted.state,
  };
}

export function createHermesBridgeResultState(workspaceId: string): HermesBridgeResultState {
  return { workspaceId, events: [], processedEventIds: [] };
}

export function selectHermesBridgeDispatchStatus(
  taskState: CentralTaskState,
  receipt: HermesDispatchReceipt,
): HermesBridgeDispatchStatus {
  if (receipt.workspaceId !== taskState.workspaceId) {
    return {
      status: 'workspace_mismatch',
      dispatchId: receipt.dispatchId,
      workspaceId: receipt.workspaceId,
      taskId: receipt.taskId,
    };
  }

  const task = taskState.tasks[receipt.taskId];
  if (!task) {
    return {
      status: 'not_found',
      dispatchId: receipt.dispatchId,
      workspaceId: receipt.workspaceId,
      taskId: receipt.taskId,
    };
  }

  return {
    status: 'found',
    dispatchId: receipt.dispatchId,
    workspaceId: receipt.workspaceId,
    commandChannel: receipt.commandChannel,
    conversationId: receipt.conversationId,
    taskId: receipt.taskId,
    taskStatus: task.status,
    approvalRequired: task.requiresApproval,
    approvalStatus: task.approvalStatus,
    updatedAt: task.updatedAt,
  };
}

export function recordHermesBridgeResultEvent(
  state: HermesBridgeResultState,
  taskState: CentralTaskState,
  binding: AuthenticatedHermesBinding,
  input: unknown,
): HermesBridgeResultEventResponse {
  const parsed = HermesBridgeResultEventSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'rejected', code: 'invalid_result_event', issues: validationIssues(parsed.error) };
  }

  const event = parsed.data;
  if (event.workspaceId !== state.workspaceId || event.workspaceId !== taskState.workspaceId || event.workspaceId !== binding.workspaceId) {
    return { status: 'rejected', code: 'workspace_mismatch' };
  }
  if (event.connectionId !== binding.connectionId) return { status: 'rejected', code: 'connection_mismatch' };

  const existingEvent = state.events.find((item) => item.eventId === event.eventId);
  if (existingEvent || state.processedEventIds.includes(event.eventId)) {
    return { status: 'duplicate', state, event: existingEvent ?? event };
  }

  if (!taskState.tasks[event.taskId]) return { status: 'rejected', code: 'task_not_found' };

  return {
    status: 'accepted',
    state: {
      ...state,
      events: [...state.events, event].slice(-MAX_BRIDGE_RESULT_EVENTS),
      processedEventIds: [event.eventId, ...state.processedEventIds].slice(0, MAX_BRIDGE_RESULT_IDS),
    },
    event,
  };
}
