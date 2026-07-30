import type { OfficeSceneAgent } from '../types';
import type { OfficeRoomSlot } from './officeRoster';

/**
 * A self-contained showroom roster. Presentation mode demonstrates the product
 * and must never expose a client's inactive draft names or settings. WhatsApp
 * is the exception: it remains empty until that workspace has a real configured
 * and office-activated agent, so the showroom never invents a connected channel.
 * Operative mode continues to consume the real, activation-filtered roster.
 */
const PRESENTATION_AGENTS: Record<string, OfficeSceneAgent> = {
  coordinator: {
    id: 'coordinator',
    name: 'Orquestador IA',
    department: 'Coordinación',
    color: '#BFE7E6',
    status: 'working',
    appearance: { shirtColor: '#316464', pantsColor: '#0f172a', skinColor: '#f4c99b', hairColor: '#292524' },
  },
  'lead-intake': {
    id: 'lead-intake',
    name: 'Agente WhatsApp',
    department: 'WhatsApp',
    color: '#22c55e',
    status: 'working',
    appearance: { shirtColor: '#15803d', pantsColor: '#172033', skinColor: '#d89b6a', hairColor: '#281a13' },
  },
  strategy: {
    id: 'strategy',
    name: 'Asistente de Voz',
    department: 'Línea telefónica',
    color: '#38bdf8',
    status: 'working',
    appearance: { shirtColor: '#0369a1', pantsColor: '#111827', skinColor: '#f1c19b', hairColor: '#151515' },
  },
  chatbot: {
    id: 'chatbot',
    name: 'Chatbot',
    department: 'Atención automática',
    color: '#8AD3D2',
    status: 'working',
    appearance: { shirtColor: '#5AA9A8', pantsColor: '#172033', skinColor: '#cbd5e1', hairColor: '#334155' },
  },
  'specialist-1': {
    id: 'specialist-1',
    name: 'Analista de Datos',
    department: 'Datos e informes',
    color: '#60a5fa',
    status: 'working',
    appearance: { shirtColor: '#2563eb', pantsColor: '#172033', skinColor: '#d89b6a', hairColor: '#281a13' },
  },
  'specialist-2': {
    id: 'specialist-2',
    name: 'Community Manager',
    department: 'Redes sociales',
    color: '#f472b6',
    status: 'working',
    appearance: { shirtColor: '#db2777', pantsColor: '#202536', skinColor: '#f1c19b', hairColor: '#151515' },
  },
  'specialist-3': {
    id: 'specialist-3',
    name: 'Gestor Comercial',
    department: 'Ventas y propuestas',
    color: '#34d399',
    status: 'working',
    appearance: { shirtColor: '#059669', pantsColor: '#1f2937', skinColor: '#8d5524', hairColor: '#19110b' },
  },
  'specialist-4': {
    id: 'specialist-4',
    name: 'Administrativo',
    department: 'Operaciones',
    color: '#A0DCDB',
    status: 'working',
    appearance: { shirtColor: '#79CBCA', pantsColor: '#152235', skinColor: '#f2c6a0', hairColor: '#6b3f25' },
  },
  'specialist-5': {
    id: 'specialist-5',
    name: 'Especialista Financiero',
    department: 'Finanzas',
    color: '#4ade80',
    status: 'working',
    appearance: { shirtColor: '#15803d', pantsColor: '#1e293b', skinColor: '#e3ab7a', hairColor: '#171310' },
  },
  'specialist-6': {
    id: 'specialist-6',
    name: 'Especialista de Seguridad',
    department: 'Ciberseguridad',
    color: '#22d3ee',
    status: 'working',
    appearance: { shirtColor: '#0e7490', pantsColor: '#111827', skinColor: '#f4c99b', hairColor: '#222222' },
  },
  'specialist-7': {
    id: 'specialist-7',
    name: 'Gestor de Agenda',
    department: 'Agenda y citas',
    color: '#f59e0b',
    status: 'working',
    appearance: { shirtColor: '#d97706', pantsColor: '#1e293b', skinColor: '#e3ab7a', hairColor: '#1a1a1a' },
  },
  'specialist-8': {
    id: 'specialist-8',
    name: 'Control de Calidad',
    department: 'Revisión y calidad',
    color: '#2dd4bf',
    status: 'working',
    appearance: { shirtColor: '#0d9488', pantsColor: '#1e293b', skinColor: '#f4c99b', hairColor: '#5c3a21' },
  },
};

export function buildPresentationRoomSlots(rooms: OfficeRoomSlot[]): OfficeRoomSlot[] {
  return rooms.map((slot) => {
    if (slot.seatId === 'lead-intake' && slot.occupant === null) return slot;
    const demoAgent = PRESENTATION_AGENTS[slot.seatId];
    if (!demoAgent) return slot;
    return { seatId: slot.seatId, room: demoAgent, occupant: demoAgent };
  });
}
