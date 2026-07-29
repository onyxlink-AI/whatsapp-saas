import type { CentralReportState, ReportActor, ReportExportResult, ReportFormat, ReportHistoryEntry } from './types';

export function selectReports(state: CentralReportState) {
  return Object.values(state.reports)
    .filter((report) => report.status !== 'deleted')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function selectReportHistory(state: CentralReportState, reportId: string): ReportHistoryEntry[] {
  return state.history.filter((entry) => entry.reportId === reportId);
}

export function requestReportExport(
  state: CentralReportState,
  actor: ReportActor,
  reportId: string,
  format: ReportFormat,
  requestedAt: string,
  commandId: string,
): ReportExportResult {
  if (actor.role !== 'super_admin' && actor.workspaceId !== state.workspaceId) return { success: false, error: 'unauthorized' };
  if (!['super_admin', 'workspace_admin'].includes(actor.role)) return { success: false, error: 'unauthorized' };
  const report = state.reports[reportId];
  if (!report) return { success: false, error: 'report_not_found' };
  if (report.workspaceId !== state.workspaceId) return { success: false, error: 'workspace_mismatch' };
  if (report.status !== 'ready' || !report.content) return { success: false, error: 'report_not_ready' };
  const filenameBase = report.title.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'informe';
  const request = {
    reportId, workspaceId: state.workspaceId, format, filename: `${filenameBase}.${format}`,
    requestedAt, reportRevision: report.revision,
  };
  const duplicate = state.history.some((entry) =>
    entry.commandId === commandId && entry.reportId === reportId && entry.action === 'export_requested' && entry.note === format,
  );
  if (duplicate) return { success: true, request, state };
  const history: ReportHistoryEntry = {
    commandId, workspaceId: state.workspaceId, reportId, action: 'export_requested', actor, occurredAt: requestedAt,
    revision: report.revision, note: format,
  };
  return {
    success: true,
    request,
    state: { ...state, history: [...state.history, history].slice(-5_000) },
  };
}
