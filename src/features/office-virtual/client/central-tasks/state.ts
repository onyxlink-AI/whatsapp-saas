import type {
  CentralTask,
  CentralTaskState,
  TaskCommand,
  TaskHistoryAction,
  TaskHistoryEntry,
  TaskMutationResult,
  TaskStatus,
} from './types';

const MAX_PROCESSED_COMMANDS = 2_000;
const MAX_HISTORY_ENTRIES = 5_000;
const TERMINAL_STATUSES = new Set<TaskStatus>(['completed', 'cancelled']);
const HUMAN_ROLES = new Set(['super_admin', 'workspace_admin', 'workspace_member']);

export function createCentralTaskState(workspaceId: string): CentralTaskState {
  return { workspaceId, tasks: {}, history: [], processedCommandIds: [] };
}

function success(state: CentralTaskState, task: CentralTask, duplicate = false): TaskMutationResult {
  return { success: true, state, task, duplicate };
}

function historyAction(command: TaskCommand): TaskHistoryAction {
  if (command.type === 'task.created') return 'created';
  if (command.type === 'task.updated') return 'updated';
  if (command.type === 'task.assigned') return 'assigned';
  if (command.type === 'task.started') return 'started';
  if (command.type === 'task.approval_requested') return 'approval_requested';
  if (command.type === 'task.approval_resolved') {
    return command.decision === 'approved' ? 'approval_approved' : 'approval_rejected';
  }
  if (command.type === 'task.blocked') return 'blocked';
  if (command.type === 'task.completed') return 'completed';
  if (command.type === 'task.failed') return 'failed';
  if (command.type === 'task.cancelled') return 'cancelled';
  return 'reopened';
}

function commandNote(command: TaskCommand): string | null {
  if ('reason' in command) return command.reason ?? null;
  if (command.type === 'task.approval_resolved') return command.note?.trim() || null;
  return null;
}

function nextStatus(current: CentralTask, command: TaskCommand): TaskStatus | null {
  if (command.type === 'task.updated') return TERMINAL_STATUSES.has(current.status) ? null : current.status;
  if (command.type === 'task.assigned') return current.status;
  if (command.type === 'task.started') return current.status === 'pending' ? 'in_progress' : null;
  if (command.type === 'task.approval_requested') {
    return current.status === 'in_progress' || current.status === 'pending' ? 'approval_required' : null;
  }
  if (command.type === 'task.approval_resolved') {
    if (current.status !== 'approval_required') return null;
    return command.decision === 'approved' ? 'in_progress' : 'blocked';
  }
  if (command.type === 'task.blocked') {
    return ['pending', 'in_progress', 'approval_required'].includes(current.status) ? 'blocked' : null;
  }
  if (command.type === 'task.completed') return current.status === 'in_progress' ? 'completed' : null;
  if (command.type === 'task.failed') return current.status === 'in_progress' ? 'failed' : null;
  if (command.type === 'task.cancelled') return TERMINAL_STATUSES.has(current.status) ? null : 'cancelled';
  if (command.type === 'task.reopened') {
    return ['blocked', 'failed', 'cancelled'].includes(current.status) ? 'pending' : null;
  }
  return null;
}

function applyExistingCommand(current: CentralTask, command: Exclude<TaskCommand, { type: 'task.created' }>): CentralTask | null {
  const status = nextStatus(current, command);
  if (status === null) return null;

  const next: CentralTask = {
    ...current,
    status,
    revision: current.revision + 1,
    updatedAt: command.occurredAt,
    completedAt: status === 'completed' ? command.occurredAt : null,
  };

  if (command.type === 'task.updated') {
    next.title = command.patch.title?.trim() ?? current.title;
    next.description = command.patch.description?.trim() ?? current.description;
    if (command.patch.priority !== undefined) next.priority = command.patch.priority;
    if (command.patch.assignedAgentId !== undefined) next.assignedAgentId = command.patch.assignedAgentId;
    if (command.patch.contactId !== undefined) next.contactId = command.patch.contactId;
    if (command.patch.dueAt !== undefined) next.dueAt = command.patch.dueAt;
    if (command.patch.source !== undefined) next.source = command.patch.source;
    if (command.patch.requiresApproval !== undefined) {
      next.requiresApproval = command.patch.requiresApproval;
      next.approvalStatus = command.patch.requiresApproval
        ? current.approvalStatus === 'not_required' ? 'pending' : current.approvalStatus
        : 'not_required';
    }
  }
  if (command.type === 'task.assigned') next.assignedAgentId = command.assignedAgentId;
  if (command.type === 'task.approval_requested') {
    next.requiresApproval = true;
    next.approvalStatus = 'pending';
    next.approvalReason = command.reason.trim();
  }
  if (command.type === 'task.approval_resolved') {
    next.approvalStatus = command.decision;
    if (command.decision === 'rejected') next.blockedReason = command.note?.trim() || 'Aprobación rechazada.';
  }
  if (command.type === 'task.blocked') next.blockedReason = command.reason.trim();
  if (command.type === 'task.failed') next.failureReason = command.reason.trim();
  if (command.type === 'task.reopened') {
    next.blockedReason = null;
    next.failureReason = null;
    next.approvalStatus = next.requiresApproval ? 'pending' : 'not_required';
  }
  return next;
}

export function applyTaskCommand(state: CentralTaskState, command: TaskCommand): TaskMutationResult {
  if (command.workspaceId !== state.workspaceId) return { success: false, code: 'workspace_mismatch' };

  if (state.processedCommandIds.includes(command.commandId)) {
    const duplicateTask = state.tasks[command.taskId];
    return duplicateTask ? success(state, duplicateTask, true) : { success: false, code: 'task_not_found' };
  }

  if (command.type === 'task.created') {
    if (state.tasks[command.taskId]) return { success: false, code: 'task_exists' };
    const requiresApproval = command.requiresApproval ?? false;
    const task: CentralTask = {
      id: command.taskId,
      workspaceId: state.workspaceId,
      title: command.title.trim(),
      description: command.description?.trim() ?? '',
      priority: command.priority ?? 'normal',
      status: 'pending',
      source: command.source ?? 'manual',
      assignedAgentId: command.assignedAgentId ?? null,
      contactId: command.contactId ?? null,
      dueAt: command.dueAt ?? null,
      requiresApproval,
      approvalStatus: requiresApproval ? 'pending' : 'not_required',
      approvalReason: null,
      blockedReason: null,
      failureReason: null,
      revision: 1,
      createdAt: command.occurredAt,
      createdBy: command.actor.actorId,
      updatedAt: command.occurredAt,
      completedAt: null,
    };
    const entry: TaskHistoryEntry = {
      commandId: command.commandId,
      taskId: task.id,
      workspaceId: state.workspaceId,
      action: 'created',
      actor: command.actor,
      occurredAt: command.occurredAt,
      fromStatus: null,
      toStatus: task.status,
      note: null,
      revision: task.revision,
    };
    return success({
      ...state,
      tasks: { ...state.tasks, [task.id]: task },
      history: [...state.history, entry].slice(-MAX_HISTORY_ENTRIES),
      processedCommandIds: [command.commandId, ...state.processedCommandIds].slice(0, MAX_PROCESSED_COMMANDS),
    }, task);
  }

  const current = state.tasks[command.taskId];
  if (!current) return { success: false, code: 'task_not_found' };
  if (command.expectedRevision !== current.revision) return { success: false, code: 'stale_revision' };
  if (command.type === 'task.approval_resolved' && !HUMAN_ROLES.has(command.actor.role)) {
    return { success: false, code: 'unauthorized' };
  }
  if (command.type === 'task.completed' && current.requiresApproval && current.approvalStatus !== 'approved') {
    return { success: false, code: 'approval_required' };
  }

  const next = applyExistingCommand(current, command);
  if (!next) return { success: false, code: 'invalid_transition' };
  const entry: TaskHistoryEntry = {
    commandId: command.commandId,
    taskId: current.id,
    workspaceId: state.workspaceId,
    action: historyAction(command),
    actor: command.actor,
    occurredAt: command.occurredAt,
    fromStatus: current.status,
    toStatus: next.status,
    note: commandNote(command),
    revision: next.revision,
  };

  return success({
    ...state,
    tasks: { ...state.tasks, [next.id]: next },
    history: [...state.history, entry].slice(-MAX_HISTORY_ENTRIES),
    processedCommandIds: [command.commandId, ...state.processedCommandIds].slice(0, MAX_PROCESSED_COMMANDS),
  }, next);
}
