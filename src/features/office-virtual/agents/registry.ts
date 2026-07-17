import type { AgentId, AgentInput } from '../schemas';
import { coordinatorAgent } from './coordinator';
import { leadIntakeAgent } from './lead-intake';
import { strategyAgent } from './strategy';
import { proposalAgent } from './proposal';
import { operationsAgent } from './operations';
import { contentAgent } from './content';
import { reviewQaAgent } from './review-qa';
import type { AgentRunner } from './types';

export type AgentMeta = {
  id: AgentId;
  name: string;
  department: string;
  role: string;
  description: string;
};

// Descriptions are the "Purpose" line from each estructura/docs/agent-specs/*.md file.
export const AGENT_META: Record<AgentId, AgentMeta> = {
  coordinator: {
    id: 'coordinator',
    name: 'Onyx',
    department: 'Coordinación',
    role: 'Coordinador de la oficina',
    description: 'Recibe cada solicitud, decide qué especialista debe atenderla y por qué. No hace el trabajo de los especialistas.',
  },
  'lead-intake': {
    id: 'lead-intake',
    name: 'Sofía',
    department: 'Lead Intake',
    role: 'Agente de Captación',
    description: 'Convierte el interés entrante en un lead estructurado: empresa, nicho, canal, dolor, urgencia.',
  },
  strategy: {
    id: 'strategy',
    name: 'Elena',
    department: 'Estrategia',
    role: 'Agente de Estrategia',
    description: 'Recomienda el diseño de solución adecuado para cada oportunidad.',
  },
  proposal: {
    id: 'proposal',
    name: 'Marco',
    department: 'Propuestas',
    role: 'Agente de Propuestas',
    description: 'Convierte una estrategia cualificada en una propuesta comercial con precio y mantenimiento explícitos.',
  },
  operations: {
    id: 'operations',
    name: 'Nexo',
    department: 'Operaciones',
    role: 'Agente de Operaciones',
    description: 'Convierte el trabajo aprobado en un plan de implementación ejecutable.',
  },
  content: {
    id: 'content',
    name: 'Lucía',
    department: 'Contenido',
    role: 'Agente de Contenido',
    description: 'Convierte entregables del negocio en activos de contenido reutilizables.',
  },
  'review-qa': {
    id: 'review-qa',
    name: 'Aria',
    department: 'Revisión / QA',
    role: 'Agente de Revisión y QA',
    description: 'Detecta huecos antes de que un entregable avance de etapa.',
  },
};

export const AGENT_RUNNERS: Record<AgentId, AgentRunner<AgentInput, unknown>> = {
  coordinator: coordinatorAgent,
  'lead-intake': leadIntakeAgent,
  strategy: strategyAgent,
  proposal: proposalAgent,
  operations: operationsAgent,
  content: contentAgent,
  'review-qa': reviewQaAgent,
};

export const AGENT_ORDER: AgentId[] = [
  'coordinator',
  'lead-intake',
  'strategy',
  'proposal',
  'operations',
  'content',
  'review-qa',
];
