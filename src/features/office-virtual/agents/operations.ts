import { type AgentInput, type ProposalDraft, OpsPlanSchema, type OpsPlan } from '../schemas';
import type { AgentRunner, RunnerContext } from './types';

export const operationsAgent: AgentRunner<AgentInput, OpsPlan> = {
  id: 'operations',
  promptVersion: 'v1',
  async run({ text, context }, _ctx: RunnerContext) {
    const proposal = (context?.proposal ?? null) as ProposalDraft | null;
    const scope = proposal?.scope?.length ? proposal.scope : [text.trim().slice(0, 60) || 'Entregable principal'];

    const plan: OpsPlan = {
      phases: scope.map((item, i) => ({
        name: `Fase ${i + 1}: ${item}`,
        description: `Implementar y validar "${item}" según el alcance aprobado.`,
      })),
      milestones: ['Kickoff', 'Entrega de la primera versión funcional', 'Cierre y traspaso'],
      ownerSuggestions: ['Responsable técnico', 'Responsable de cuenta'],
      dependencies: proposal ? ['Aprobación de la propuesta'] : [],
      blockers: [],
      deliveryChecklist: ['Accesos del cliente concedidos', 'Entorno de pruebas listo', 'QA final aprobado'],
    };

    return OpsPlanSchema.parse(plan);
  },
};
