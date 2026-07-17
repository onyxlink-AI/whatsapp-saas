import { type AgentInput, type LeadBrief, StrategyBriefSchema, type StrategyBrief } from '../schemas';
import type { AgentRunner, RunnerContext } from './types';

const SOLUTION_BY_NICHE: Record<string, { solution: string; stack: string[] }> = {
  'Tienda / e-commerce': {
    solution: 'Chatbot de atención al cliente + seguimiento de pedidos',
    stack: ['WhatsApp Business API', 'CRM ligero', 'Base de conocimiento de productos'],
  },
  'Restauración': {
    solution: 'Agente de reservas y pedidos por WhatsApp',
    stack: ['WhatsApp Business API', 'Calendario de reservas', 'Integración con TPV'],
  },
  'Salud / clínica': {
    solution: 'Asistente de agendamiento y recordatorios de citas',
    stack: ['Calendario clínico', 'WhatsApp / SMS', 'Recordatorios automáticos'],
  },
  'Inmobiliaria': {
    solution: 'Agente de captación y cualificación de leads',
    stack: ['Formulario web', 'CRM inmobiliario', 'WhatsApp'],
  },
  'Agencia / servicios': {
    solution: 'Agente de intake y cualificación comercial',
    stack: ['Formulario web', 'CRM', 'Email'],
  },
  'SaaS / software': {
    solution: 'Asistente de onboarding y soporte de producto',
    stack: ['Base de conocimiento', 'Chat in-app', 'Integración con el producto'],
  },
};

const DEFAULT_SOLUTION = {
  solution: 'Asistente de automatización interna a medida',
  stack: ['Automatización de workflows', 'Integración con herramientas existentes'],
};

export const strategyAgent: AgentRunner<AgentInput, StrategyBrief> = {
  id: 'strategy',
  promptVersion: 'v1',
  async run({ text, context }, _ctx: RunnerContext) {
    const lead = (context?.lead ?? null) as LeadBrief | null;
    const niche = lead?.niche;
    const picked = (niche && SOLUTION_BY_NICHE[niche]) || DEFAULT_SOLUTION;
    const painPoints = lead?.painPoints?.filter((p) => p !== 'No especificado') ?? [];

    const brief: StrategyBrief = {
      recommendedSolution: picked.solution,
      rationale:
        painPoints.length > 0
          ? `Responde directamente a lo detectado en el intake: ${painPoints.join('; ')}.`
          : `Basado en la descripción recibida: "${text.trim().slice(0, 140)}".`,
      stack: picked.stack,
      risks: ['Calidad de los datos de entrada', 'Adopción del equipo del cliente'],
      prerequisites: ['Acceso a los canales del cliente', 'Contenido/base de conocimiento inicial'],
      successCriteria: ['Tiempo de primera respuesta reducido', 'Casos resueltos sin intervención humana'],
    };

    return StrategyBriefSchema.parse(brief);
  },
};
