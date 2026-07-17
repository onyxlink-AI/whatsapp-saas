import { type AgentInput, CoordinatorDecisionSchema, type CoordinatorDecision, type Stage } from '../schemas';
import type { AgentRunner, RunnerContext } from './types';

const EXPECTED_SCHEMA: Record<Stage, string> = {
  new_lead: 'LeadBrief',
  qualified: 'StrategyBrief',
  strategy_drafted: 'ProposalDraft',
  proposal_ready: 'QAResult (sobre la propuesta)',
  awaiting_approval: 'ApprovalRequest (decisión humana)',
  ops_ready: 'OpsPlan',
  in_execution: 'QAResult (sobre la ejecución)',
  qa_review: 'QAResult (sobre la ejecución)',
  completed: '—',
  blocked: 'Intervención humana',
};

// estructura/docs/architecture.md > "Suggested stages" drives this table.
// The coordinator only routes — estructura/docs/agent-specs/coordinator.md
// rule: "never do specialist work directly".
export function routeForStage(stage: Stage): CoordinatorDecision {
  switch (stage) {
    case 'new_lead':
      return {
        nextAgent: 'lead-intake',
        reason: 'Hay un lead nuevo sin estructurar: toca clasificarlo primero.',
        expectedSchema: EXPECTED_SCHEMA.new_lead,
        requiresApproval: false,
      };
    case 'qualified':
      return {
        nextAgent: 'strategy',
        reason: 'El lead ya está cualificado: toca recomendar una solución.',
        expectedSchema: EXPECTED_SCHEMA.qualified,
        requiresApproval: false,
      };
    case 'strategy_drafted':
      return {
        nextAgent: 'proposal',
        reason: 'La estrategia está lista: toca redactar la propuesta comercial.',
        expectedSchema: EXPECTED_SCHEMA.strategy_drafted,
        requiresApproval: false,
      };
    case 'proposal_ready':
      return {
        nextAgent: 'review-qa',
        reason: 'Hay una propuesta borrador: hay que validarla antes de pedir aprobación humana.',
        expectedSchema: EXPECTED_SCHEMA.proposal_ready,
        requiresApproval: false,
      };
    case 'awaiting_approval':
      return {
        nextAgent: 'human',
        reason: 'La propuesta pasó QA: se necesita aprobación humana antes de pasar a Operaciones.',
        expectedSchema: EXPECTED_SCHEMA.awaiting_approval,
        requiresApproval: true,
      };
    case 'ops_ready':
      return {
        nextAgent: 'operations',
        reason: 'La propuesta fue aprobada: toca construir el plan de implementación.',
        expectedSchema: EXPECTED_SCHEMA.ops_ready,
        requiresApproval: false,
      };
    case 'in_execution':
    case 'qa_review':
      return {
        nextAgent: 'review-qa',
        reason: 'Hay un plan en ejecución: hay que revisarlo antes de cerrar el run.',
        expectedSchema: EXPECTED_SCHEMA.in_execution,
        requiresApproval: false,
      };
    case 'completed':
      return {
        nextAgent: 'done',
        reason: 'El workflow ya llegó a completed. No queda nada por rutar.',
        expectedSchema: EXPECTED_SCHEMA.completed,
        requiresApproval: false,
      };
    case 'blocked':
      return {
        nextAgent: 'human',
        reason: 'El run está bloqueado (QA no superado o aprobación rechazada). Necesita revisión humana.',
        expectedSchema: EXPECTED_SCHEMA.blocked,
        requiresApproval: true,
      };
  }
}

export const coordinatorAgent: AgentRunner<AgentInput, CoordinatorDecision> = {
  id: 'coordinator',
  promptVersion: 'v1',
  async run({ context }, _ctx: RunnerContext) {
    const stage = (context?.stage as Stage | undefined) ?? 'new_lead';
    return CoordinatorDecisionSchema.parse(routeForStage(stage));
  },
};
