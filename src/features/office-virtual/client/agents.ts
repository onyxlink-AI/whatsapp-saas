import { AGENT_META, AGENT_ORDER } from '../agents/registry';
import { OFFICE_SEAT_BINDINGS } from './central-events';
import type { AgentId } from '../schemas';
import type { Agent, AgentStatus, CharacterAppearance } from './types';

/**
 * The office roster is the real 7-role agent office from `estructura/`
 * (see estructura/docs/agent-specs/*.md): name, department, role and
 * description come straight from agents/registry.ts (AGENT_META), which is
 * the same registry the backend engine (orchestrator/engine.ts) uses. Only
 * the purely visual bits — color, starting status, Minecraft appearance —
 * live here.
 */

/**
 * Visual-only relabeling for the three seats with a fixed identity in the
 * real SaaS (see COORDINACION_CLAUDE_CODEX.md > "Dirección vinculante tras
 * revisar el SaaS real"). AgentId and AGENT_META stay untouched — the
 * orchestrator/tests never see this — only what the office *displays*
 * changes, driven by OFFICE_SEAT_BINDINGS so it can't drift from the
 * contract. The four specialists keep their current identity as-is: they're
 * configurable placeholders, not yet bound to anything real.
 */
const SEAT_OVERRIDES: Partial<Record<AgentId, { name?: string; department: string; role: string; description: string }>> = {
  coordinator: {
    name: 'Orquestador',
    department: 'Coordinación',
    role: 'Orquestador',
    description: 'Coordina la actividad real de WhatsApp, Voz y los especialistas, y decide qué puesto debe atender cada caso.',
  },
  'lead-intake': {
    department: 'WhatsApp',
    role: 'Agente WhatsApp',
    description:
      'Representa al agente de WhatsApp activo del workspace (setter, soporte o agendamiento) — solo uno puede estar activo a la vez, no son tres agentes en paralelo.',
  },
  strategy: {
    department: 'Voz',
    role: 'Agente de Voz',
    description:
      'Representa al asistente de voz del workspace, conectado a Vapi. Comparte contacto e historial con WhatsApp cuando la memoria cruzada está activa.',
  },
};
const VISUAL: Record<AgentId, { color: string; status: AgentStatus; appearance: CharacterAppearance }> = {
  coordinator: {
    color: '#e2e8f0',
    status: 'available',
    appearance: { shirtColor: '#1e293b', pantsColor: '#0f172a', skinColor: '#f4c99b', hairColor: '#5c5c5c' },
  },
  'lead-intake': {
    color: '#38bdf8',
    status: 'available',
    appearance: { shirtColor: '#2563eb', pantsColor: '#1e293b', skinColor: '#f4c99b', hairColor: '#3b2417' },
  },
  strategy: {
    color: '#fbbf24',
    status: 'available',
    appearance: { shirtColor: '#7c3aed', pantsColor: '#111827', skinColor: '#f4c99b', hairColor: '#4a2c1a' },
  },
  proposal: {
    color: '#34d399',
    status: 'available',
    appearance: { shirtColor: '#059669', pantsColor: '#1e293b', skinColor: '#e3ab7a', hairColor: '#171310' },
  },
  operations: {
    color: '#a78bfa',
    status: 'available',
    appearance: { shirtColor: '#f97316', pantsColor: '#111827', skinColor: '#f4c99b', hairColor: '#222222' },
  },
  content: {
    color: '#f472b6',
    status: 'available',
    appearance: { shirtColor: '#db2777', pantsColor: '#1e293b', skinColor: '#e3ab7a', hairColor: '#1a1a1a' },
  },
  'review-qa': {
    color: '#2dd4bf',
    status: 'available',
    appearance: { shirtColor: '#0d9488', pantsColor: '#1e293b', skinColor: '#f4c99b', hairColor: '#5c3a21' },
  },
};

export const agents: Agent[] = AGENT_ORDER.map((id) => {
  const meta = AGENT_META[id];
  const override = SEAT_OVERRIDES[id];
  return {
    id,
    name: override?.name ?? meta.name,
    department: override?.department ?? meta.department,
    role: override?.role ?? meta.role,
    description: override?.description ?? meta.description,
    seat: OFFICE_SEAT_BINDINGS[id],
    ...VISUAL[id],
  };
});
