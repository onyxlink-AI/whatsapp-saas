import type { AgentId } from '../../schemas';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'approval_required'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskSource = 'manual' | 'whatsapp' | 'voice' | 'automation' | 'routine';
export type TaskApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';
export type TaskActorRole = 'super_admin' | 'workspace_admin' | 'workspace_member' | 'agent' | 'system';

export type TaskActor = {
  actorId: string;
  role: TaskActorRole;
};

export type CentralTask = {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  source: TaskSource;
  assignedAgentId: AgentId | null;
  contactId: string | null;
  dueAt: string | null;
  requiresApproval: boolean;
  approvalStatus: TaskApprovalStatus;
  approvalReason: string | null;
  blockedReason: string | null;
  failureReason: string | null;
  revision: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TaskHistoryAction =
  | 'created'
  | 'updated'
  | 'assigned'
  | 'started'
  | 'approval_requested'
  | 'approval_approved'
  | 'approval_rejected'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'reopened';

export type TaskHistoryEntry = {
  commandId: string;
  taskId: string;
  workspaceId: string;
  action: TaskHistoryAction;
  actor: TaskActor;
  occurredAt: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  note: string | null;
  revision: number;
};

export type CentralTaskState = {
  workspaceId: string;
  tasks: Record<string, CentralTask>;
  history: TaskHistoryEntry[];
  processedCommandIds: string[];
};

type TaskCommandBase = {
  commandId: string;
  workspaceId: string;
  actor: TaskActor;
  occurredAt: string;
};

type ExistingTaskCommandBase = TaskCommandBase & {
  taskId: string;
  expectedRevision: number;
};

export type TaskCommand =
  | (TaskCommandBase & {
      type: 'task.created';
      taskId: string;
      title: string;
      description?: string;
      priority?: TaskPriority;
      source?: TaskSource;
      assignedAgentId?: AgentId | null;
      contactId?: string | null;
      dueAt?: string | null;
      requiresApproval?: boolean;
    })
  | (ExistingTaskCommandBase & {
      type: 'task.updated';
      patch: Partial<Pick<CentralTask, 'title' | 'description' | 'priority' | 'assignedAgentId' | 'contactId' | 'dueAt' | 'source' | 'requiresApproval'>>;
    })
  | (ExistingTaskCommandBase & { type: 'task.assigned'; assignedAgentId: AgentId | null })
  | (ExistingTaskCommandBase & { type: 'task.started' })
  | (ExistingTaskCommandBase & { type: 'task.approval_requested'; reason: string })
  | (ExistingTaskCommandBase & {
      type: 'task.approval_resolved';
      decision: 'approved' | 'rejected';
      note?: string;
    })
  | (ExistingTaskCommandBase & { type: 'task.blocked'; reason: string })
  | (ExistingTaskCommandBase & { type: 'task.completed' })
  | (ExistingTaskCommandBase & { type: 'task.failed'; reason: string })
  | (ExistingTaskCommandBase & { type: 'task.cancelled'; reason?: string })
  | (ExistingTaskCommandBase & { type: 'task.reopened' });

export type TaskMutationErrorCode =
  | 'workspace_mismatch'
  | 'task_not_found'
  | 'task_exists'
  | 'stale_revision'
  | 'invalid_transition'
  | 'approval_required'
  | 'unauthorized';

export type TaskMutationResult =
  | { success: true; state: CentralTaskState; task: CentralTask; duplicate: boolean }
  | { success: false; code: TaskMutationErrorCode };

export type TaskFilters = {
  query?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedAgentId?: AgentId;
  contactId?: string;
  source?: TaskSource;
  overdueOnly?: boolean;
};

export type TaskStats = {
  total: number;
  pending: number;
  inProgress: number;
  approvalRequired: number;
  blocked: number;
  completed: number;
  failed: number;
  overdue: number;
};
