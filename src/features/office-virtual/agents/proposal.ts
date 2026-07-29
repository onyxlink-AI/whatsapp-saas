import { type AgentInput, type StrategyBrief, ProposalDraftSchema, type ProposalDraft } from '../schemas';
import type { AgentRunner, RunnerContext } from './types';

export const proposalAgent: AgentRunner<AgentInput, ProposalDraft> = {
  id: 'proposal',
  promptVersion: 'v1',
  async run({ text, context }, _ctx: RunnerContext) {
    const strategy = (context?.strategy ?? null) as StrategyBrief | null;
    const stackSize = strategy?.stack.length ?? 2;
    const oneOffPrice = 900 + stackSize * 150;
    const recurringMaintenancePrice = Math.round(oneOffPrice * 0.12);

    const draft: ProposalDraft = {
      offerSummary: strategy
        ? `${strategy.recommendedSolution} para el negocio descrito.`
        : `Solución a medida a partir de: "${text.trim().slice(0, 140)}".`,
      scope: strategy?.stack ?? ['Diagnóstico', 'Implementación', 'Puesta en marcha'],
      exclusions: ['Migración de datos históricos', 'Integraciones no listadas en el alcance'],
      timeline: '2-4 semanas desde la aprobación',
      oneOffPrice,
      recurringMaintenancePrice,
      nextSteps: ['Validación interna (Review/QA)', 'Aprobación humana', 'Handoff a Operaciones'],
    };

    return ProposalDraftSchema.parse(draft);
  },
};
