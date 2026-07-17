import type { AgentId } from '../../schemas';

export type OfficeActivityStatus =
  | 'queued'
  | 'working'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'approval_required';

export type OfficeActivitySource = 'whatsapp' | 'voice' | 'manual' | 'automation';

export type OfficeEntityType =
  | 'contact'
  | 'conversation'
  | 'voice_call'
  | 'deal'
  | 'project'
  | 'task'
  | 'appointment'
  | 'template';

/** Channel-neutral activity received from the future ONYXLINK control panel. */
export type OfficeActivityEvent = {
  id: string;
  activityId: string;
  workspaceId: string;
  agentId: AgentId;
  status: OfficeActivityStatus;
  source: OfficeActivitySource;
  title: string;
  occurredAt: string;
  runId?: string;
  entityType?: OfficeEntityType;
  entityId?: string;
  dedupeKey?: string;
  payload?: Record<string, unknown>;
};

export type AgentRuntimeStatus = OfficeActivityStatus | 'available';

export type AgentActivitySnapshot = {
  agentId: AgentId;
  status: AgentRuntimeStatus;
  event: OfficeActivityEvent | null;
  activeCount: number;
};

export type OfficeActivityState = {
  activities: Record<string, OfficeActivityEvent>;
  recentEvents: OfficeActivityEvent[];
  processedEventIds: string[];
  processedDedupeKeys: string[];
};

