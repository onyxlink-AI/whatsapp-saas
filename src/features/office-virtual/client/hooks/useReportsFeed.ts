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

function seedDemoReportsState(workspaceId: string, actor: ReportActor, analytics: WorkspaceAnalytics | null): CentralReportState {
  let state = createCentralReportState(workspaceId);
  if (!analytics) return state;
  const occurredAt = new Date().toISOString();
  const seeds: Array<{ id: string; title: string; kind: ReportKind; period: AnalyticsPeriod; agentIds: AgentId[] }> = [
    { id: 'demo-report-executive', title: 'Resumen ejecutivo semanal', kind: 'overview', period: '7d', agentIds: [] },
    { id: 'demo-report-channels', title: 'Rendimiento por canales y equipo', kind: 'channels', period: '30d', agentIds: ['lead-intake', 'proposal', 'operations'] },
  ];
  for (const seed of seeds) {
    state = applyOrKeep(state, {
      type: 'report.created', commandId: `create-${seed.id}`, reportId: seed.id, workspaceId,
      actor, occurredAt, title: seed.title, kind: seed.kind, period: seed.period, agentIds: seed.agentIds,
    });
    state = applyOrKeep(state, {
      type: 'report.generation_started', commandId: `start-${seed.id}`, reportId: seed.id, workspaceId,
      expectedRevision: state.reports[seed.id].revision, actor, occurredAt,
    });
    state = applyOrKeep(state, {
      type: 'report.generated', commandId: `finish-${seed.id}`, reportId: seed.id, workspaceId,
      expectedRevision: state.reports[seed.id].revision, actor, occurredAt,
      content: buildReportContent({ kind: seed.kind, analytics, agentIds: seed.agentIds }),
    });
  }
  return state;
}

export function useReportsFeed(workspaceId: string, actor: ReportActor, analytics: WorkspaceAnalytics | null, demoMode = false): ReportsFeed {
  // Honestly empty — no reports exist until someone actually asks for one
  // (createReport + generateReport, both already real user actions below).
  // This used to auto-seed two reports and mark one as already "generated"
  // with content derived from fixture-tainted analytics the moment this
  // hook mounted — indistinguishable from a real report to an admin who
  // never asked for it (see useTaskFeed.ts for the same honesty pattern).
  const [state, setState] = useState(() => demoMode
    ? seedDemoReportsState(workspaceId, actor, analytics)
    : createCentralReportState(workspaceId));
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
