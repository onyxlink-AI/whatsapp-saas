import { useEffect, useMemo, useState } from 'react';
import type { AgentId } from '../../schemas';
import type { ContactChannel } from '../central-contacts/types';
import {
  applyTaskCommand,
  createCentralTaskState,
  createTaskFixtures,
  selectTaskHistory,
  selectTasks,
} from '../central-tasks';
import type {
  CentralTask,
  CentralTaskState,
  TaskActor,
  TaskCommand,
  TaskHistoryAction as CentralTaskHistoryAction,
  TaskPriority,
  TaskStatus,
} from '../central-tasks';

export type { TaskPriority, TaskStatus } from '../central-tasks';
export type TaskHistoryAction = CentralTaskHistoryAction;

export type TaskHistoryEntry = {
  id: string;
  action: TaskHistoryAction;
  actorId: string;
  occurredAt: string;
  note: string | null;
};

export type Task = {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  responsibleAgentId: AgentId | null;
  contactId: string | null;
  channel: ContactChannel | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  history: TaskHistoryEntry[];
};

export type TaskDraft = {
  title: string;
  description: string;
  priority: TaskPriority;
  responsibleAgentId: AgentId | null;
  contactId: string | null;
  channel: ContactChannel | null;
  dueAt: string | null;
};

export type TaskFilters = {
  query: string;
  agentId: AgentId | 'all';
  priority: TaskPriority | 'all';
  status: TaskStatus | 'all';
  channel: ContactChannel | 'all';
};

const DEFAULT_FILTERS: TaskFilters = { query: '', agentId: 'all', priority: 'all', status: 'all', channel: 'all' };

export const EMPTY_DRAFT: TaskDraft = {
  title: '',
  description: '',
  priority: 'normal',
  responsibleAgentId: null,
  contactId: null,
  channel: null,
  dueAt: null,
};

type TaskAction = 'assign' | 'start' | 'request_approval' | 'approve' | 'reject' | 'resume' | 'complete' | 'block' | 'cancel';

export const TASK_TRANSITIONS: Record<TaskStatus, TaskAction[]> = {
  pending: ['assign', 'start', 'cancel'],
  in_progress: ['request_approval', 'complete', 'block', 'cancel'],
  approval_required: ['approve', 'reject'],
  blocked: ['resume', 'cancel'],
  completed: [],
  failed: ['resume', 'cancel'],
  cancelled: ['resume'],
};

function applyOrKeep(state: CentralTaskState, command: TaskCommand): CentralTaskState {
  const result = applyTaskCommand(state, command);
  return result.success ? result.state : state;
}

/** Exported for isolation tests — verifies fixtures come back scoped to the given workspace/actor, not a shared demo constant. */
export function seedTaskState(workspaceId: string, actor: TaskActor): CentralTaskState {
  let state = createTaskFixtures(workspaceId).reduce(
    applyOrKeep,
    createCentralTaskState(workspaceId),
  );

  const commands: TaskCommand[] = [
    {
      type: 'task.started', commandId: 'task-seed-start-follow-up', taskId: 'task-follow-up',
      workspaceId: workspaceId, expectedRevision: 1, actor: actor,
      occurredAt: '2026-07-15T08:05:00.000Z',
    },
    {
      type: 'task.created', commandId: 'task-seed-create-template', taskId: 'task-template',
      workspaceId: workspaceId, actor: actor, occurredAt: '2026-07-15T08:20:00.000Z',
      title: 'Revisar plantilla de bienvenida', description: 'Actualizar el tono de la plantilla de bienvenida de WhatsApp.',
      priority: 'low', source: 'manual',
    },
    {
      type: 'task.created', commandId: 'task-seed-create-discount', taskId: 'task-discount',
      workspaceId: workspaceId, actor: actor, occurredAt: '2026-07-15T08:25:00.000Z',
      title: 'Aprobar descuento especial', description: 'Revisar un descuento fuera de política antes de enviarlo.',
      priority: 'urgent', source: 'whatsapp', assignedAgentId: 'proposal', contactId: 'contact-lucia', requiresApproval: true,
    },
    {
      type: 'task.started', commandId: 'task-seed-start-discount', taskId: 'task-discount',
      workspaceId: workspaceId, expectedRevision: 1, actor: actor,
      occurredAt: '2026-07-15T08:26:00.000Z',
    },
    {
      type: 'task.approval_requested', commandId: 'task-seed-approval-discount', taskId: 'task-discount',
      workspaceId: workspaceId, expectedRevision: 2, actor: { actorId: 'proposal-agent', role: 'agent' },
      occurredAt: '2026-07-15T08:27:00.000Z', reason: 'Descuento fuera de la política configurada.',
    },
    {
      type: 'task.created', commandId: 'task-seed-create-cold-lead', taskId: 'task-cold-lead',
      workspaceId: workspaceId, actor: actor, occurredAt: '2026-07-15T08:30:00.000Z',
      title: 'Reactivar lead frío', description: 'Retomar contacto tras 30 días sin respuesta.',
      priority: 'normal', source: 'automation', assignedAgentId: 'operations',
    },
    {
      type: 'task.started', commandId: 'task-seed-start-cold-lead', taskId: 'task-cold-lead',
      workspaceId: workspaceId, expectedRevision: 1, actor: actor,
      occurredAt: '2026-07-15T08:31:00.000Z',
    },
    {
      type: 'task.blocked', commandId: 'task-seed-block-cold-lead', taskId: 'task-cold-lead',
      workspaceId: workspaceId, expectedRevision: 2, actor: actor,
      occurredAt: '2026-07-15T08:32:00.000Z', reason: 'Esperando una nueva ventana de contacto.',
    },
  ];

  for (const command of commands) state = applyOrKeep(state, command);
  return state;
}

function channelFromTask(task: CentralTask): ContactChannel | null {
  return task.source === 'whatsapp' || task.source === 'voice' ? task.source : null;
}

function projectTask(state: CentralTaskState, task: CentralTask): Task {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    responsibleAgentId: task.assignedAgentId,
    contactId: task.contactId,
    channel: channelFromTask(task),
    dueAt: task.dueAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    history: selectTaskHistory(state, task.id).map((entry) => ({
      id: entry.commandId,
      action: entry.action,
      actorId: entry.actor.actorId,
      occurredAt: entry.occurredAt,
      note: entry.note,
    })),
  };
}

export type TaskFeed = {
  state: CentralTaskState;
  loading: boolean;
  tasks: Task[];
  filteredTasks: Task[];
  filters: TaskFilters;
  setFilters: (patch: Partial<TaskFilters>) => void;
  resetFilters: () => void;
  createTask: (draft: TaskDraft) => string | null;
  updateTask: (id: string, patch: Partial<TaskDraft>) => void;
  assignTask: (id: string, agentId: AgentId) => void;
  startTask: (id: string) => void;
  requestApproval: (id: string, note?: string) => void;
  approveTask: (id: string) => void;
  rejectTask: (id: string, note?: string) => void;
  resumeTask: (id: string) => void;
  completeTask: (id: string) => void;
  blockTask: (id: string, note?: string) => void;
  cancelTask: (id: string, note?: string) => void;
};

export function useTaskFeed(workspaceId: string, actor: TaskActor): TaskFeed {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<CentralTaskState>(() => seedTaskState(workspaceId, actor));
  const [filters, setFiltersState] = useState<TaskFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const setFilters = (patch: Partial<TaskFilters>) => setFiltersState((previous) => ({ ...previous, ...patch }));
  const resetFilters = () => setFiltersState(DEFAULT_FILTERS);

  const dispatchForTask = (taskId: string, build: (task: CentralTask) => TaskCommand) => {
    setState((previous) => {
      const task = previous.tasks[taskId];
      if (!task) return previous;
      return applyOrKeep(previous, build(task));
    });
  };

  const createTask = (draft: TaskDraft): string | null => {
    if (!draft.title.trim()) return null;
    const taskId = crypto.randomUUID();
    setState((previous) => applyOrKeep(previous, {
      type: 'task.created', commandId: crypto.randomUUID(), taskId, workspaceId: previous.workspaceId,
      actor: actor, occurredAt: new Date().toISOString(), title: draft.title,
      description: draft.description, priority: draft.priority, assignedAgentId: draft.responsibleAgentId,
      contactId: draft.contactId, dueAt: draft.dueAt, source: draft.channel ?? 'manual',
    }));
    return taskId;
  };

  const updateTask = (taskId: string, patch: Partial<TaskDraft>) => dispatchForTask(taskId, (task) => ({
    type: 'task.updated', commandId: crypto.randomUUID(), taskId, workspaceId: task.workspaceId,
    expectedRevision: task.revision, actor: actor, occurredAt: new Date().toISOString(),
    patch: {
      title: patch.title, description: patch.description, priority: patch.priority,
      assignedAgentId: patch.responsibleAgentId, contactId: patch.contactId, dueAt: patch.dueAt,
      source: patch.channel === undefined ? undefined : patch.channel ?? 'manual',
    },
  }));

  const assignTask = (taskId: string, agentId: AgentId) => dispatchForTask(taskId, (task) => ({
    type: 'task.assigned', commandId: crypto.randomUUID(), taskId, assignedAgentId: agentId,
    workspaceId: task.workspaceId, expectedRevision: task.revision, actor: actor, occurredAt: new Date().toISOString(),
  }));
  const startTask = (taskId: string) => dispatchForTask(taskId, (task) => ({
    type: 'task.started', commandId: crypto.randomUUID(), taskId, workspaceId: task.workspaceId,
    expectedRevision: task.revision, actor: actor, occurredAt: new Date().toISOString(),
  }));
  const requestApproval = (taskId: string, note?: string) => dispatchForTask(taskId, (task) => ({
    type: 'task.approval_requested', commandId: crypto.randomUUID(), taskId, workspaceId: task.workspaceId,
    expectedRevision: task.revision, actor: actor, occurredAt: new Date().toISOString(),
    reason: note?.trim() || 'Requiere aprobación humana antes de continuar.',
  }));
  const resolveApproval = (taskId: string, decision: 'approved' | 'rejected', note?: string) => dispatchForTask(taskId, (task) => ({
    type: 'task.approval_resolved', commandId: crypto.randomUUID(), taskId, workspaceId: task.workspaceId,
    expectedRevision: task.revision, actor: actor, occurredAt: new Date().toISOString(), decision, note,
  }));
  const resumeTask = (taskId: string) => dispatchForTask(taskId, (task) => ({
    type: 'task.reopened', commandId: crypto.randomUUID(), taskId, workspaceId: task.workspaceId,
    expectedRevision: task.revision, actor: actor, occurredAt: new Date().toISOString(),
  }));
  const completeTask = (taskId: string) => dispatchForTask(taskId, (task) => ({
    type: 'task.completed', commandId: crypto.randomUUID(), taskId, workspaceId: task.workspaceId,
    expectedRevision: task.revision, actor: actor, occurredAt: new Date().toISOString(),
  }));
  const blockTask = (taskId: string, note?: string) => dispatchForTask(taskId, (task) => ({
    type: 'task.blocked', commandId: crypto.randomUUID(), taskId, workspaceId: task.workspaceId,
    expectedRevision: task.revision, actor: actor, occurredAt: new Date().toISOString(),
    reason: note?.trim() || 'Bloqueada manualmente.',
  }));
  const cancelTask = (taskId: string, note?: string) => dispatchForTask(taskId, (task) => ({
    type: 'task.cancelled', commandId: crypto.randomUUID(), taskId, workspaceId: task.workspaceId,
    expectedRevision: task.revision, actor: actor, occurredAt: new Date().toISOString(), reason: note,
  }));

  const tasks = useMemo(() => selectTasks(state).map((task) => projectTask(state, task)), [state]);
  const filteredTasks = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase('es');
    return tasks.filter((task) =>
      (filters.agentId === 'all' || task.responsibleAgentId === filters.agentId) &&
      (filters.priority === 'all' || task.priority === filters.priority) &&
      (filters.status === 'all' || task.status === filters.status) &&
      (filters.channel === 'all' || task.channel === filters.channel) &&
      (!query || `${task.title} ${task.description}`.toLocaleLowerCase('es').includes(query)),
    );
  }, [tasks, filters]);

  return {
    state, loading, tasks, filteredTasks, filters, setFilters, resetFilters, createTask, updateTask, assignTask,
    startTask, requestApproval, approveTask: (id) => resolveApproval(id, 'approved'),
    rejectTask: (id, note) => resolveApproval(id, 'rejected', note), resumeTask, completeTask,
    blockTask, cancelTask,
  };
}
