import type {
  CentralReport,
  CentralReportState,
  ReportCommand,
  ReportHistoryAction,
  ReportHistoryEntry,
  ReportMutationResult,
} from './types';

const MAX_HISTORY = 5_000;
const MAX_COMMANDS = 2_000;
const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin']);

export function createCentralReportState(workspaceId: string): CentralReportState {
  return { workspaceId, reports: {}, history: [], processedCommandIds: [] };
}

function action(command: ReportCommand): ReportHistoryAction {
  if (command.type === 'report.generation_started') return 'generation_started';
  return command.type.replace('report.', '') as ReportHistoryAction;
}

function success(state: CentralReportState, report: CentralReport, duplicate = false): ReportMutationResult {
  return { success: true, state, report, duplicate };
}

function append(state: CentralReportState, command: ReportCommand, report: CentralReport): CentralReportState {
  const entry: ReportHistoryEntry = {
    commandId: command.commandId, workspaceId: state.workspaceId, reportId: report.id, action: action(command),
    actor: command.actor, occurredAt: command.occurredAt, revision: report.revision,
    note: command.type === 'report.failed' ? command.reason.trim() : null,
  };
  return {
    ...state,
    reports: { ...state.reports, [report.id]: report },
    history: [...state.history, entry].slice(-MAX_HISTORY),
    processedCommandIds: [command.commandId, ...state.processedCommandIds].slice(0, MAX_COMMANDS),
  };
}

export function applyReportCommand(state: CentralReportState, command: ReportCommand): ReportMutationResult {
  if (command.workspaceId !== state.workspaceId) return { success: false, code: 'workspace_mismatch' };
  if (command.actor.role !== 'super_admin' && command.actor.workspaceId !== state.workspaceId) {
    return { success: false, code: 'unauthorized' };
  }
  if (!ADMIN_ROLES.has(command.actor.role)) return { success: false, code: 'unauthorized' };
  if (state.processedCommandIds.includes(command.commandId)) {
    const existing = state.reports[command.reportId];
    return existing ? success(state, existing, true) : { success: false, code: 'report_not_found' };
  }

  if (command.type === 'report.created') {
    if (state.reports[command.reportId]) return { success: false, code: 'report_exists' };
    const report: CentralReport = {
      id: command.reportId, workspaceId: state.workspaceId, title: command.title.trim(), kind: command.kind,
      period: command.period, agentIds: [...new Set(command.agentIds)], status: 'draft', content: null,
      failureReason: null, revision: 1, createdAt: command.occurredAt, createdBy: command.actor.actorId,
      updatedAt: command.occurredAt, generatedAt: null, deletedAt: null,
    };
    return success(append(state, command, report), report);
  }

  const current = state.reports[command.reportId];
  if (!current) return { success: false, code: 'report_not_found' };
  if (current.revision !== command.expectedRevision) return { success: false, code: 'stale_revision' };
  let report: CentralReport | null = null;
  if (command.type === 'report.generation_started' && ['draft', 'ready', 'failed'].includes(current.status)) {
    report = { ...current, status: 'generating', content: null, failureReason: null, revision: current.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'report.generated' && current.status === 'generating') {
    report = { ...current, status: 'ready', content: command.content, generatedAt: command.occurredAt, revision: current.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'report.failed' && current.status === 'generating') {
    report = { ...current, status: 'failed', failureReason: command.reason.trim(), revision: current.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'report.deleted' && current.status !== 'deleted') {
    report = { ...current, status: 'deleted', deletedAt: command.occurredAt, revision: current.revision + 1, updatedAt: command.occurredAt };
  }
  if (!report) return { success: false, code: 'invalid_transition' };
  return success(append(state, command, report), report);
}
