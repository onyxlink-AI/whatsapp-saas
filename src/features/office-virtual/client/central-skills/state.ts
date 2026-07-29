import { isSkillEligibleAgent, isSkillSpecialistAgent } from './eligibility';
import type {
  CentralSkillState, SkillAuditAction, SkillCommand, SkillDefinition, SkillMutationResult,
  SkillRecord, SkillStatus, SkillVersion,
} from './types';

const MAX_PROCESSED_COMMANDS = 2_000;
const MAX_AUDIT_ENTRIES = 5_000;
const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin']);

export function createCentralSkillState(workspaceId: string): CentralSkillState {
  return { workspaceId, skills: {}, versions: {}, testRuns: {}, audit: [], processedCommandIds: [] };
}

function cloneDefinition(definition: SkillDefinition): SkillDefinition {
  return {
    objective: definition.objective,
    triggers: definition.triggers.map((trigger) => ({ ...trigger })),
    inputs: definition.inputs.map((input) => ({ ...input })),
    steps: definition.steps.map((step) => ({ ...step })),
    tools: definition.tools.map((tool) => ({ ...tool })),
    outputs: definition.outputs.map((output) => ({ ...output })),
    approval: { ...definition.approval },
  };
}

function validDefinition(definition: SkillDefinition): boolean {
  const ids = [
    ...definition.triggers.map((item) => item.id), ...definition.inputs.map((item) => item.id),
    ...definition.steps.map((item) => item.id), ...definition.tools.map((item) => item.id),
    ...definition.outputs.map((item) => item.id),
  ];
  const toolIds = new Set(definition.tools.map((tool) => tool.id));
  return Boolean(
    definition.objective.trim() && definition.triggers.length && definition.steps.length && definition.outputs.length &&
    ids.every((id) => id.trim()) && new Set(ids).size === ids.length &&
    definition.triggers.every((item) => item.description.trim()) &&
    definition.steps.every((item) => item.title.trim() && (!item.toolId || toolIds.has(item.toolId))) &&
    definition.outputs.every((item) => item.name.trim() || item.description.trim()),
  );
}

function versionFrom(skill: SkillRecord, actorId: string, occurredAt: string, restoredFromVersion: number | null): SkillVersion {
  return {
    id: `${skill.id}:v${skill.currentVersion}`, skillId: skill.id, workspaceId: skill.workspaceId,
    version: skill.currentVersion, name: skill.name, description: skill.description, risk: skill.risk,
    ownerAgentId: skill.ownerAgentId, assignedAgentIds: [...skill.assignedAgentIds],
    definition: cloneDefinition(skill.definition), createdAt: occurredAt, createdBy: actorId, restoredFromVersion,
  };
}

function actionOf(command: SkillCommand): SkillAuditAction {
  if (command.type === 'skill.test_recorded') return 'tested';
  return command.type.replace('skill.', '') as SkillAuditAction;
}

function success(state: CentralSkillState, skill: SkillRecord, duplicate = false): SkillMutationResult {
  return { success: true, state, skill, duplicate };
}

function isOwnerAgent(command: SkillCommand, skill?: SkillRecord): boolean {
  return command.actor.role === 'agent' && Boolean(command.actor.agentId) && command.actor.agentId === (skill?.ownerAgentId ?? ('ownerAgentId' in command ? command.ownerAgentId : undefined));
}

function canIssue(command: SkillCommand, skill?: SkillRecord): boolean {
  if (ADMIN_ROLES.has(command.actor.role)) return true;
  if (command.actor.role === 'system') return command.type === 'skill.candidate_created' || command.type === 'skill.metrics_recorded';
  if (!isOwnerAgent(command, skill)) return false;
  return command.type === 'skill.candidate_created' || command.type === 'skill.updated' || command.type === 'skill.test_recorded';
}

function nextStatus(current: SkillRecord, command: Exclude<SkillCommand, { type: 'skill.created' | 'skill.candidate_created' }>): SkillStatus | null {
  if (command.type === 'skill.updated' || command.type === 'skill.version_restored') {
    return ['candidate', 'draft', 'approved', 'active', 'paused', 'rejected'].includes(current.status) ? 'draft' : null;
  }
  if (command.type === 'skill.assignments_updated') return current.status === 'archived' ? null : current.status;
  if (command.type === 'skill.test_recorded') return ['candidate', 'draft', 'paused'].includes(current.status) ? 'draft' : null;
  if (command.type === 'skill.approved') return current.status === 'draft' ? 'approved' : null;
  if (command.type === 'skill.published') return current.status === 'approved' || (current.status === 'paused' && current.approvedVersion === current.currentVersion) ? 'active' : null;
  if (command.type === 'skill.paused') return current.status === 'active' ? 'paused' : null;
  if (command.type === 'skill.rejected') return ['candidate', 'draft', 'approved'].includes(current.status) ? 'rejected' : null;
  if (command.type === 'skill.archived') return current.status !== 'active' && current.status !== 'archived' ? 'archived' : null;
  if (command.type === 'skill.metrics_recorded') return current.status === 'active' ? 'active' : null;
  return null;
}

export function applySkillCommand(state: CentralSkillState, command: SkillCommand): SkillMutationResult {
  if (command.workspaceId !== state.workspaceId || (command.actor.workspaceId && command.actor.workspaceId !== state.workspaceId)) {
    return { success: false, code: 'workspace_mismatch' };
  }
  if (state.processedCommandIds.includes(command.commandId)) {
    const existing = state.skills[command.skillId];
    return existing ? success(state, existing, true) : { success: false, code: 'skill_not_found' };
  }

  if (command.type === 'skill.created' || command.type === 'skill.candidate_created') {
    if (state.skills[command.skillId]) return { success: false, code: 'skill_exists' };
    if (!canIssue(command)) return { success: false, code: 'unauthorized' };
    if (!isSkillEligibleAgent(command.ownerAgentId) || (command.type === 'skill.candidate_created' && !isSkillSpecialistAgent(command.ownerAgentId))) {
      return { success: false, code: 'ineligible_agent' };
    }
    const assignedAgentIds = command.type === 'skill.created' ? [...new Set(command.assignedAgentIds ?? [command.ownerAgentId])] : [command.ownerAgentId];
    if (assignedAgentIds.some((id) => !isSkillEligibleAgent(id))) return { success: false, code: 'ineligible_agent' };
    if (!command.name.trim() || !validDefinition(command.definition)) return { success: false, code: 'invalid_definition' };
    const skill: SkillRecord = {
      id: command.skillId, workspaceId: state.workspaceId, name: command.name.trim(), description: command.description?.trim() ?? '',
      status: command.type === 'skill.created' ? 'draft' : 'candidate', origin: command.type === 'skill.created' ? 'manual' : 'learned',
      risk: command.type === 'skill.created' ? command.risk : 'low', ownerAgentId: command.ownerAgentId,
      assignedAgentIds, definition: cloneDefinition(command.definition), evidenceTaskIds: command.type === 'skill.candidate_created' ? [...new Set(command.evidenceTaskIds)] : [],
      metrics: { detectedOccurrences: command.type === 'skill.candidate_created' ? command.detectedOccurrences : 0, successfulRuns: 0, failedRuns: 0, averageDurationMs: null, estimatedMinutesSaved: 0, averageCostUsd: null },
      revision: 1, currentVersion: 1, approvedVersion: null, createdAt: command.occurredAt, createdBy: command.actor.actorId, updatedAt: command.occurredAt,
    };
    const version = versionFrom(skill, command.actor.actorId, command.occurredAt, null);
    const entry = { commandId: command.commandId, skillId: skill.id, workspaceId: state.workspaceId, action: actionOf(command), actor: command.actor, occurredAt: command.occurredAt, fromStatus: null, toStatus: skill.status, revision: 1, note: null } as const;
    return success({ ...state, skills: { ...state.skills, [skill.id]: skill }, versions: { ...state.versions, [version.id]: version }, audit: [...state.audit, entry], processedCommandIds: [command.commandId, ...state.processedCommandIds].slice(0, MAX_PROCESSED_COMMANDS) }, skill);
  }

  const current = state.skills[command.skillId];
  if (!current) return { success: false, code: 'skill_not_found' };
  if (command.expectedRevision !== current.revision) return { success: false, code: 'stale_revision' };
  if (!canIssue(command, current)) return { success: false, code: 'unauthorized' };
  const status = nextStatus(current, command);
  if (!status) return { success: false, code: 'invalid_transition' };
  if (command.type === 'skill.approved') {
    const passed = Object.values(state.testRuns).some((run) => run.skillId === current.id && run.skillVersion === current.currentVersion && run.status === 'passed');
    if (!passed) return { success: false, code: 'test_required' };
  }

  let next: SkillRecord = { ...current, status, revision: current.revision + 1, updatedAt: command.occurredAt };
  let versions = state.versions;
  let testRuns = state.testRuns;
  let note: string | null = 'reason' in command ? command.reason?.trim() || null : null;
  let restoredFromVersion: number | null = null;

  if (command.type === 'skill.updated') {
    const definition = command.patch.definition ? cloneDefinition(command.patch.definition) : current.definition;
    if (!validDefinition(definition)) return { success: false, code: 'invalid_definition' };
    if (command.patch.ownerAgentId && !isSkillEligibleAgent(command.patch.ownerAgentId)) return { success: false, code: 'ineligible_agent' };
    next = { ...next, name: command.patch.name?.trim() || current.name, description: command.patch.description?.trim() ?? current.description, risk: command.patch.risk ?? current.risk, ownerAgentId: command.patch.ownerAgentId ?? current.ownerAgentId, definition, currentVersion: current.currentVersion + 1, approvedVersion: null };
  }
  if (command.type === 'skill.assignments_updated') {
    const assignments = [...new Set(command.assignedAgentIds)];
    if (assignments.some((id) => !isSkillEligibleAgent(id))) return { success: false, code: 'ineligible_agent' };
    next = { ...next, assignedAgentIds: assignments };
  }
  if (command.type === 'skill.version_restored') {
    const source = state.versions[`${current.id}:v${command.sourceVersion}`];
    if (!source) return { success: false, code: 'version_not_found' };
    next = { ...next, name: source.name, description: source.description, risk: source.risk, ownerAgentId: source.ownerAgentId, assignedAgentIds: [...source.assignedAgentIds], definition: cloneDefinition(source.definition), currentVersion: current.currentVersion + 1, approvedVersion: null };
    restoredFromVersion = source.version;
    note = `Restaurada desde v${source.version}.`;
  }
  if (command.type === 'skill.test_recorded') {
    testRuns = { ...testRuns, [command.testRunId]: { id: command.testRunId, skillId: current.id, workspaceId: state.workspaceId, skillVersion: current.currentVersion, status: command.status, trace: command.trace.map((step) => ({ ...step })), durationMs: command.durationMs, estimatedCostUsd: command.estimatedCostUsd, occurredAt: command.occurredAt, runBy: command.actor.actorId } };
    note = command.status;
  }
  if (command.type === 'skill.approved') next.approvedVersion = current.currentVersion;
  if (command.type === 'skill.metrics_recorded') {
    const total = current.metrics.successfulRuns + current.metrics.failedRuns;
    const nextTotal = total + 1;
    next.metrics = { detectedOccurrences: current.metrics.detectedOccurrences, successfulRuns: current.metrics.successfulRuns + (command.successful ? 1 : 0), failedRuns: current.metrics.failedRuns + (command.successful ? 0 : 1), averageDurationMs: Math.round(((current.metrics.averageDurationMs ?? 0) * total + command.durationMs) / nextTotal), estimatedMinutesSaved: current.metrics.estimatedMinutesSaved + command.estimatedMinutesSaved, averageCostUsd: ((current.metrics.averageCostUsd ?? 0) * total + command.costUsd) / nextTotal };
  }
  if (next.currentVersion !== current.currentVersion) {
    const version = versionFrom(next, command.actor.actorId, command.occurredAt, restoredFromVersion);
    versions = { ...versions, [version.id]: version };
  }

  const entry = { commandId: command.commandId, skillId: current.id, workspaceId: state.workspaceId, action: actionOf(command), actor: command.actor, occurredAt: command.occurredAt, fromStatus: current.status, toStatus: next.status, revision: next.revision, note };
  return success({ ...state, skills: { ...state.skills, [next.id]: next }, versions, testRuns, audit: [...state.audit, entry].slice(-MAX_AUDIT_ENTRIES), processedCommandIds: [command.commandId, ...state.processedCommandIds].slice(0, MAX_PROCESSED_COMMANDS) }, next);
}
