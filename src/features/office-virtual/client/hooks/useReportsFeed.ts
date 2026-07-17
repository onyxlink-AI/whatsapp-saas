import { useState } from 'react';
import type { AgentId } from '../../schemas';
import type { WorkspaceAnalytics } from '../central-analytics';
import type { AnalyticsPeriod } from '../central-events';
import {
  applyReportCommand,
  buildReportContent,
  createCentralReportState,
  requestReportExport,
  selectReports,
} from '../central-reports';
import type {
  CentralReport,
  CentralReportState,
  ReportActor,
  ReportExportRequest,
  ReportFormat,
  ReportKind,
} from '../central-reports';

export type ReportDraft = {
  title: string;
  kind: ReportKind;
  period: AnalyticsPeriod;
  agentIds: AgentId[];
};

export type ReportsFeed = {
  reports: CentralReport[];
  loading: boolean;
  error: string | null;
  lastExportRequest: ReportExportRequest | null;
  createReport: (draft: ReportDraft) => string | null;
  generateReport: (reportId: string) => void;
  regenerateReport: (reportId: string) => void;
  deleteReport: (reportId: string) => void;
  exportReport: (reportId: string, format: ReportFormat) => ReportExportRequest | null;
};

function applyOrKeep(state: CentralReportState, command: Parameters<typeof applyReportCommand>[1]): CentralReportState {
  const result = applyReportCommand(state, command);
  return result.success ? result.state : state;
}

function seedState(workspaceId: string, actor: ReportActor, analytics: WorkspaceAnalytics | null): CentralReportState {
  const now = new Date().toISOString();
  let state = applyOrKeep(createCentralReportState(workspaceId), {
    type: 'report.created', commandId: 'report-seed-created-overview', reportId: 'report-overview', workspaceId,
    actor, occurredAt: now, title: 'Resumen operativo', kind: 'overview', period: '7d', agentIds: [],
  });
  state = applyOrKeep(state, {
    type: 'report.created', commandId: 'report-seed-created-agents', reportId: 'report-agents', workspaceId,
    actor, occurredAt: now, title: 'Rendimiento por agente', kind: 'agents', period: '7d', agentIds: [],
  });
  if (!analytics) return state;
  state = applyOrKeep(state, {
    type: 'report.generation_started', commandId: 'report-seed-started-overview', reportId: 'report-overview', workspaceId,
    expectedRevision: 1, actor, occurredAt: now,
  });
  return applyOrKeep(state, {
    type: 'report.generated', commandId: 'report-seed-generated-overview', reportId: 'report-overview', workspaceId,
    expectedRevision: 2, actor, occurredAt: now, content: buildReportContent({ kind: 'overview', analytics }),
  });
}

export function useReportsFeed(workspaceId: string, actor: ReportActor, analytics: WorkspaceAnalytics | null): ReportsFeed {
  const [state, setState] = useState(() => seedState(workspaceId, actor, analytics));
  const [error, setError] = useState<string | null>(null);
  const [lastExportRequest, setLastExportRequest] = useState<ReportExportRequest | null>(null);

  const createReport = (draft: ReportDraft): string | null => {
    if (!draft.title.trim()) return null;
    const reportId = crypto.randomUUID();
    setState((previous) => applyOrKeep(previous, {
      type: 'report.created', commandId: crypto.randomUUID(), reportId, workspaceId: previous.workspaceId,
      actor, occurredAt: new Date().toISOString(), title: draft.title, kind: draft.kind,
      period: draft.period, agentIds: draft.agentIds,
    }));
    return reportId;
  };

  const generateReport = (reportId: string) => setState((previous) => {
    const report = previous.reports[reportId];
    if (!report) return previous;
    const occurredAt = new Date().toISOString();
    let next = applyOrKeep(previous, {
      type: 'report.generation_started', commandId: crypto.randomUUID(), reportId, workspaceId: previous.workspaceId,
      expectedRevision: report.revision, actor, occurredAt,
    });
    const generating = next.reports[reportId];
    if (!analytics) {
      setError('No hay métricas disponibles para generar el informe.');
      return applyOrKeep(next, {
        type: 'report.failed', commandId: crypto.randomUUID(), reportId, workspaceId: previous.workspaceId,
        expectedRevision: generating.revision, actor, occurredAt, reason: 'Analytics unavailable.',
      });
    }
    setError(null);
    next = applyOrKeep(next, {
      type: 'report.generated', commandId: crypto.randomUUID(), reportId, workspaceId: previous.workspaceId,
      expectedRevision: generating.revision, actor, occurredAt,
      content: buildReportContent({ kind: report.kind, analytics, agentIds: report.agentIds }),
    });
    return next;
  });

  const deleteReport = (reportId: string) => setState((previous) => {
    const report = previous.reports[reportId];
    if (!report) return previous;
    return applyOrKeep(previous, {
      type: 'report.deleted', commandId: crypto.randomUUID(), reportId, workspaceId: previous.workspaceId,
      expectedRevision: report.revision, actor, occurredAt: new Date().toISOString(),
    });
  });

  const exportReport = (reportId: string, format: ReportFormat): ReportExportRequest | null => {
    const result = requestReportExport(state, actor, reportId, format, new Date().toISOString(), crypto.randomUUID());
    if (!result.success) {
      setError(result.error);
      return null;
    }
    setState(result.state);
    setLastExportRequest(result.request);
    setError(null);
    return result.request;
  };

  return {
    reports: selectReports(state), loading: false, error, lastExportRequest,
    createReport, generateReport, regenerateReport: generateReport, deleteReport, exportReport,
  };
}
