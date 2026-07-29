import { useEffect, useMemo, useState } from 'react';
import type { AgentId } from '../../schemas';
import { agents } from '../agents';
import type { CentralTaskState } from '../central-tasks';
import {
  applySkillCommand, createCentralSkillState, detectSkillCandidates,
  selectSkillAudit, selectSkills, selectSkillTestRuns, selectSkillVersions,
  SKILL_ELIGIBLE_AGENT_IDS,
} from '../central-skills';
import type {
  CentralSkillState, SkillActor, SkillApproval as CentralSkillApproval, SkillApprovalPolicy as CentralSkillApprovalPolicy,
  SkillCommand, SkillDefinition as CentralSkillDefinition, SkillEligibleAgentId, SkillInput as CentralSkillInput,
  SkillOutput as CentralSkillOutput, SkillRecord, SkillStep as CentralSkillStep, SkillTool as CentralSkillTool,
  SkillTrigger as CentralSkillTrigger, SkillTriggerType as CentralSkillTriggerType,
} from '../central-skills';

export type SkillTriggerType = CentralSkillTriggerType;
export type SkillApprovalPolicy = CentralSkillApprovalPolicy;
export type SkillSimulationStatus = 'pending' | 'running' | 'success' | 'error';
export type SkillStatus = 'draft' | 'testing' | 'pending_approval' | 'approved' | 'published' | 'paused' | 'rejected';
export type SkillOrigin = 'installed' | 'candidate';
export type SkillTrigger = CentralSkillTrigger;
export type SkillInput = CentralSkillInput;
export type SkillTool = CentralSkillTool;
export type SkillStep = CentralSkillStep;
export type SkillOutput = CentralSkillOutput;
export type SkillApproval = CentralSkillApproval;
export type SkillDefinition = CentralSkillDefinition;
export type SkillVersion = { id: string; version: number; definition: SkillDefinition; createdAt: string; createdBy: string; changeNote: string | null };
export type SkillMetrics = { successRate: number; avgCostUsd: number; avgDurationMs: number; estimatedMinutesSaved: number; runsCount: number };
export type SkillAssignment = { agentId: AgentId; assignedAt: string };
export type Skill = { id: string; name: string; description: string; origin: SkillOrigin; status: SkillStatus; definition: SkillDefinition; versions: SkillVersion[]; metrics: SkillMetrics; assignments: SkillAssignment[]; createdAt: string; updatedAt: string; rejectionReason: string | null };
export type SkillProposal = { id: string; suggestedName: string; reason: string; detectedFromTaskCount: number; suggestedObjective: string; proposedAt: string };
export type SkillSimulationStepResult = { stepId: string; status: SkillSimulationStatus; output: string | null; durationMs: number | null };
export type SkillSimulationRun = { id: string; skillId: string; startedAt: string; finishedAt: string | null; status: SkillSimulationStatus; steps: SkillSimulationStepResult[] };
export type EligibleSkillAssignee = { agentId: AgentId; name: string; role: string; isOrchestrator: boolean };

function cloneDefinition(definition: CentralSkillDefinition): SkillDefinition {
  return JSON.parse(JSON.stringify(definition)) as SkillDefinition;
}

function viewStatus(state: CentralSkillState, skill: SkillRecord): SkillStatus {
  if (skill.status === 'active') return 'published';
  if (skill.status === 'candidate') return 'draft';
  if (skill.status === 'draft') {
    const passed = selectSkillTestRuns(state, skill.id).some((run) => run.skillVersion === skill.currentVersion && run.status === 'passed');
    return passed ? 'testing' : 'draft';
  }
  if (skill.status === 'archived') return 'rejected';
  return skill.status;
}

function projectSkill(state: CentralSkillState, skill: SkillRecord): Skill {
  const totalRuns = skill.metrics.successfulRuns + skill.metrics.failedRuns;
  const rejection = selectSkillAudit(state, skill.id).find((entry) => entry.action === 'rejected');
  return {
    id: skill.id, name: skill.name, description: skill.description,
    origin: skill.origin === 'learned' ? 'candidate' : 'installed', status: viewStatus(state, skill),
    definition: cloneDefinition(skill.definition),
    versions: selectSkillVersions(state, skill.id).map((version) => ({
      id: version.id, version: version.version, definition: cloneDefinition(version.definition),
      createdAt: version.createdAt, createdBy: version.createdBy,
      changeNote: version.restoredFromVersion ? `Restaurada desde v${version.restoredFromVersion}` : null,
    })),
    metrics: {
      successRate: totalRuns ? Math.round(skill.metrics.successfulRuns / totalRuns * 100) : 0,
      avgCostUsd: skill.metrics.averageCostUsd ?? 0,
      avgDurationMs: skill.metrics.averageDurationMs ?? 0,
      estimatedMinutesSaved: skill.metrics.estimatedMinutesSaved,
      runsCount: totalRuns,
    },
    assignments: skill.assignedAgentIds.map((agentId) => ({ agentId, assignedAt: skill.updatedAt })),
    createdAt: skill.createdAt, updatedAt: skill.updatedAt, rejectionReason: rejection?.note ?? null,
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  workspace_mismatch: 'Esta acción pertenece a otro workspace.',
  stale_revision: 'La skill cambió; vuelve a intentarlo.',
  unauthorized: 'No tienes permiso para realizar esta acción.',
  ineligible_agent: 'WhatsApp y Voz no pueden recibir skills.',
  test_required: 'Debes superar una prueba de la versión actual antes de aprobarla.',
  invalid_transition: 'Esta acción no está disponible en el estado actual.',
  invalid_definition: 'Revisa objetivo, disparadores, pasos, herramientas y resultados.',
  version_not_found: 'No se encontró esa versión.',
};

export type SkillsFeed = {
  state: CentralSkillState;
  skills: Skill[];
  proposals: SkillProposal[];
  eligibleAssignees: EligibleSkillAssignee[];
  simulationRuns: Record<string, SkillSimulationRun>;
  loading: boolean;
  error: string | null;
  createBlankSkill: (name: string) => string | null;
  createSkillFromProposal: (proposalId: string) => string | null;
  dismissProposal: (proposalId: string) => void;
  saveDraft: (skillId: string, definition: SkillDefinition) => void;
  testSkill: (skillId: string) => void;
  approveSkill: (skillId: string) => void;
  publishSkill: (skillId: string) => void;
  pauseSkill: (skillId: string) => void;
  improveSkill: (skillId: string, note: string) => void;
  rejectSkill: (skillId: string, reason: string) => void;
  assignSkill: (skillId: string, agentId: AgentId) => void;
  unassignSkill: (skillId: string, agentId: AgentId) => void;
  restoreVersion: (skillId: string, versionId: string) => void;
};

export function useSkillsFeed(taskState: CentralTaskState | undefined, workspaceId: string, actor: SkillActor): SkillsFeed {
  // Honestly empty — no real skills backend is wired yet, so this no longer
  // seeds curated demo skills as if they were the workspace's real trained
  // skills (see useTaskFeed.ts for the same pattern already applied there).
  const [state, setState] = useState(() => createCentralSkillState(workspaceId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedProposalIds, setDismissedProposalIds] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 250);
    return () => clearTimeout(timer);
  }, []);

  const dispatch = (command: SkillCommand) => setState((previous) => {
    const result = applySkillCommand(previous, command);
    if (!result.success) {
      setError(ERROR_MESSAGES[result.code] ?? 'No se pudo completar la acción.');
      return previous;
    }
    setError(null);
    return result.state;
  });
  const current = (skillId: string) => state.skills[skillId] ?? null;
  const base = () => ({ commandId: crypto.randomUUID(), workspaceId, actor: { ...actor, workspaceId }, occurredAt: new Date().toISOString() });
  const forSkill = (skillId: string, build: (skill: SkillRecord) => SkillCommand) => {
    const skill = current(skillId);
    if (skill) dispatch(build(skill));
  };

  const taskList = useMemo(() => taskState ? Object.values(taskState.tasks) : [], [taskState]);
  const insights = useMemo(() => detectSkillCandidates(taskList), [taskList]);
  const proposals = insights
    .filter((insight) => !dismissedProposalIds.includes(insight.fingerprint))
    .filter((insight) => !Object.values(state.skills).some((skill) => skill.evidenceTaskIds.some((id) => insight.evidenceTaskIds.includes(id))))
    .map((insight) => {
      const evidence = taskList.filter((task) => insight.evidenceTaskIds.includes(task.id));
      const proposedAt = evidence.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]?.updatedAt ?? new Date().toISOString();
      return { id: insight.fingerprint, suggestedName: insight.suggestedName, reason: `Detectada al completar ${insight.occurrences} tareas equivalentes.`, detectedFromTaskCount: insight.occurrences, suggestedObjective: insight.suggestedObjective, proposedAt };
    });

  const createSkillFromProposal = (proposalId: string) => {
    const insight = insights.find((item) => item.fingerprint === proposalId);
    if (!insight) return null;
    const skillId = crypto.randomUUID();
    dispatch({
      type: 'skill.candidate_created', ...base(), skillId, name: insight.suggestedName,
      description: `Candidata basada en ${insight.occurrences} tareas completadas.`,
      ownerAgentId: insight.ownerAgentId, evidenceTaskIds: insight.evidenceTaskIds,
      detectedOccurrences: insight.occurrences,
      definition: {
        objective: insight.suggestedObjective,
        triggers: [{ id: `${skillId}-trigger-manual`, type: 'manual', description: 'Ejecución manual o evento equivalente' }],
        inputs: [{ id: `${skillId}-input-context`, name: 'Contexto de la tarea', description: 'Datos autorizados de la ejecución.', required: true }],
        tools: [],
        steps: [
          { id: `${skillId}-step-context`, order: 1, title: 'Revisar el contexto', description: '', toolId: null },
          { id: `${skillId}-step-execute`, order: 2, title: 'Ejecutar el patrón aprendido', description: '', toolId: null },
          { id: `${skillId}-step-validate`, order: 3, title: 'Validar el resultado', description: '', toolId: null },
        ],
        outputs: [{ id: `${skillId}-output-result`, name: 'Resultado revisable', description: 'Resultado equivalente a las ejecuciones anteriores.' }],
        approval: { policy: 'always', note: 'Una persona administradora debe aprobarla antes de publicarla.' },
      },
    });
    setDismissedProposalIds((ids) => [...ids, proposalId]);
    return skillId;
  };

  const createBlankSkill = (name: string) => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Escribe un nombre para crear la habilidad.');
      return null;
    }
    const skillId = crypto.randomUUID();
    dispatch({
      type: 'skill.created', ...base(), skillId, name: cleanName,
      description: 'Habilidad creada manualmente. Completa su objetivo y sus pasos antes de probarla.',
      risk: 'medium', ownerAgentId: 'coordinator', assignedAgentIds: ['coordinator'],
      definition: {
        objective: `Realizar ${cleanName} de forma consistente, segura y revisable.`,
        triggers: [{ id: `${skillId}-trigger-manual`, type: 'manual', description: 'Cuando una persona la solicite' }],
        inputs: [{ id: `${skillId}-input-context`, name: 'Información necesaria', description: 'Datos autorizados para realizar el trabajo.', required: true }],
        tools: [],
        steps: [
          { id: `${skillId}-step-understand`, order: 1, title: 'Entender la petición', description: '', toolId: null },
          { id: `${skillId}-step-work`, order: 2, title: 'Realizar el trabajo', description: '', toolId: null },
          { id: `${skillId}-step-review`, order: 3, title: 'Revisar el resultado', description: '', toolId: null },
        ],
        outputs: [{ id: `${skillId}-output-result`, name: 'Resultado final', description: 'Entrega preparada para revisar.' }],
        approval: { policy: 'always', note: 'Una persona debe aprobarla antes de usarla de forma autónoma.' },
      },
    });
    return skillId;
  };

  const saveDraft = (skillId: string, definition: SkillDefinition) => forSkill(skillId, (skill) => ({ type: 'skill.updated', ...base(), skillId, expectedRevision: skill.revision, patch: { definition: cloneDefinition(definition) } }));
  const testSkill = (skillId: string) => forSkill(skillId, (skill) => ({
    type: 'skill.test_recorded', ...base(), skillId, expectedRevision: skill.revision,
    testRunId: crypto.randomUUID(), status: 'passed', durationMs: 1200, estimatedCostUsd: 0.01,
    trace: [...skill.definition.steps].sort((a, b) => a.order - b.order).map((step) => ({
      stepId: step.id, label: step.title, status: 'passed' as const,
      detail: step.toolId ? 'Paso validado sin invocar la herramienta real.' : 'Paso validado en modo simulación.',
    })),
  }));
  const approveSkill = (skillId: string) => forSkill(skillId, (skill) => ({ type: 'skill.approved', ...base(), skillId, expectedRevision: skill.revision }));
  const publishSkill = (skillId: string) => forSkill(skillId, (skill) => ({ type: 'skill.published', ...base(), skillId, expectedRevision: skill.revision }));
  const pauseSkill = (skillId: string) => forSkill(skillId, (skill) => ({ type: 'skill.paused', ...base(), skillId, expectedRevision: skill.revision, reason: 'Pausada por el administrador.' }));
  const improveSkill = (skillId: string, note: string) => forSkill(skillId, (skill) => ({ type: 'skill.updated', ...base(), skillId, expectedRevision: skill.revision, patch: { description: `${skill.description}\nMejora solicitada: ${note.trim()}`.trim() } }));
  const rejectSkill = (skillId: string, reason: string) => forSkill(skillId, (skill) => ({ type: 'skill.rejected', ...base(), skillId, expectedRevision: skill.revision, reason: reason.trim() || 'Rechazada por el administrador.' }));
  const updateAssignments = (skillId: string, update: (ids: SkillEligibleAgentId[]) => SkillEligibleAgentId[]) => forSkill(skillId, (skill) => ({ type: 'skill.assignments_updated', ...base(), skillId, expectedRevision: skill.revision, assignedAgentIds: update(skill.assignedAgentIds) }));
  const assignSkill = (skillId: string, agentId: AgentId) => {
    if (!SKILL_ELIGIBLE_AGENT_IDS.includes(agentId as SkillEligibleAgentId)) {
      setError('WhatsApp y Voz no pueden recibir skills.');
      return;
    }
    updateAssignments(skillId, (ids) => [...new Set([...ids, agentId as SkillEligibleAgentId])]);
  };
  const unassignSkill = (skillId: string, agentId: AgentId) => updateAssignments(skillId, (ids) => ids.filter((id) => id !== agentId));
  const restoreVersion = (skillId: string, versionId: string) => {
    const version = selectSkillVersions(state, skillId).find((item) => item.id === versionId);
    if (version) forSkill(skillId, (skill) => ({ type: 'skill.version_restored', ...base(), skillId, expectedRevision: skill.revision, sourceVersion: version.version }));
  };

  const simulationRuns = Object.values(state.skills).reduce<Record<string, SkillSimulationRun>>((runs, skill) => {
    const run = selectSkillTestRuns(state, skill.id)[0];
    if (run) {
      runs[skill.id] = {
        id: run.id, skillId: skill.id, startedAt: run.occurredAt, finishedAt: run.occurredAt,
        status: run.status === 'passed' ? 'success' : 'error',
        steps: run.trace.map((step) => ({
          stepId: step.stepId,
          status: step.status === 'passed' ? 'success' : step.status === 'failed' ? 'error' : 'pending',
          output: step.detail || null,
          durationMs: Math.round(run.durationMs / Math.max(run.trace.length, 1)),
        })),
      };
    }
    return runs;
  }, {});
  const eligibleAssignees = SKILL_ELIGIBLE_AGENT_IDS.map((agentId) => {
    const agent = agents.find((item) => item.id === agentId)!;
    return { agentId, name: agent.name, role: agent.role, isOrchestrator: agentId === 'coordinator' };
  });

  return {
    state,
    skills: selectSkills(state).filter((skill) => skill.status !== 'archived').map((skill) => projectSkill(state, skill)),
    proposals, eligibleAssignees, simulationRuns, loading, error,
    createBlankSkill, createSkillFromProposal,
    dismissProposal: (id) => setDismissedProposalIds((ids) => [...new Set([...ids, id])]),
    saveDraft, testSkill, approveSkill, publishSkill, pauseSkill, improveSkill, rejectSkill,
    assignSkill, unassignSkill, restoreVersion,
  };
}
