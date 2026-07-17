import type { AgentId } from '../../schemas';
import type { WorkspaceAnalytics } from '../central-analytics';
import type { AnalyticsPeriod } from '../central-events';

export type ReportKind = 'overview' | 'agents' | 'channels' | 'tasks' | 'routines' | 'approvals' | 'incidents';
export type ReportStatus = 'draft' | 'generating' | 'ready' | 'failed' | 'deleted';
export type ReportFormat = 'pdf' | 'csv';

export type ReportActor = {
  actorId: string;
  role: 'super_admin' | 'workspace_admin' | 'workspace_member' | 'system';
  workspaceId: string | null;
};

export type ReportMetric = {
  id: string;
  label: string;
  value: number;
  unit: 'count' | 'percent' | 'milliseconds';
};

export type ReportSection = {
  id: string;
  title: string;
  columns: string[];
  rows: Array<Record<string, string | number>>;
};

export type ReportContent = {
  analyticsGeneratedAt: string;
  metrics: ReportMetric[];
  sections: ReportSection[];
};

export type CentralReport = {
  id: string;
  workspaceId: string;
  title: string;
  kind: ReportKind;
  period: AnalyticsPeriod;
  agentIds: AgentId[];
  status: ReportStatus;
  content: ReportContent | null;
  failureReason: string | null;
  revision: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  generatedAt: string | null;
  deletedAt: string | null;
};

export type ReportHistoryAction = 'created' | 'generation_started' | 'generated' | 'failed' | 'deleted' | 'export_requested';

export type ReportHistoryEntry = {
  commandId: string;
  workspaceId: string;
  reportId: string;
  action: ReportHistoryAction;
  actor: ReportActor;
  occurredAt: string;
  revision: number;
  note: string | null;
};

export type CentralReportState = {
  workspaceId: string;
  reports: Record<string, CentralReport>;
  history: ReportHistoryEntry[];
  processedCommandIds: string[];
};

type ReportCommandBase = {
  commandId: string;
  workspaceId: string;
  reportId: string;
  actor: ReportActor;
  occurredAt: string;
};

type ExistingReportCommandBase = ReportCommandBase & { expectedRevision: number };

export type ReportCommand =
  | (ReportCommandBase & {
      type: 'report.created';
      title: string;
      kind: ReportKind;
      period: AnalyticsPeriod;
      agentIds: AgentId[];
    })
  | (ExistingReportCommandBase & { type: 'report.generation_started' })
  | (ExistingReportCommandBase & { type: 'report.generated'; content: ReportContent })
  | (ExistingReportCommandBase & { type: 'report.failed'; reason: string })
  | (ExistingReportCommandBase & { type: 'report.deleted' });

export type ReportMutationResult =
  | { success: true; state: CentralReportState; report: CentralReport; duplicate: boolean }
  | {
      success: false;
      code: 'workspace_mismatch' | 'report_not_found' | 'report_exists' | 'stale_revision' | 'invalid_transition' | 'unauthorized';
    };

export type ReportExportRequest = {
  reportId: string;
  workspaceId: string;
  format: ReportFormat;
  filename: string;
  requestedAt: string;
  reportRevision: number;
};

export type ReportExportResult =
  | { success: true; request: ReportExportRequest; state: CentralReportState }
  | { success: false; error: 'workspace_mismatch' | 'report_not_found' | 'report_not_ready' | 'unauthorized' };

export type BuildReportContentInput = {
  kind: ReportKind;
  analytics: WorkspaceAnalytics;
  agentIds?: AgentId[];
};
