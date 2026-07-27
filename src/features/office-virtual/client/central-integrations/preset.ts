import type { OfficeSeatId } from './specialist-seats';

// v2.0.0 — 12 despachos: orchestrator + the 3 SaaS-reused channel seats
// (WhatsApp, voice, chatbot) + 8 generic configurable specialist seats.
// Supersedes the v1.0.0 7-seat preset (coordinator/lead-intake/strategy +
// 4 pipeline-role seats) — that generation is not persisted going forward.
export type OfficePresetSeatKind = 'orchestrator' | 'whatsapp' | 'voice' | 'chatbot' | 'specialist';

export type OfficePresetSeat = {
  agentId: OfficeSeatId;
  kind: OfficePresetSeatKind;
  displayLabel: string;
  configurable: boolean;
};

export type OfficePreset = {
  id: string;
  version: string;
  displayName: string;
  seats: readonly OfficePresetSeat[];
};

export type WorkspaceOfficeSeat = OfficePresetSeat & {
  purpose: string | null;
};

export type WorkspaceOfficeConfiguration = {
  workspaceId: string;
  presetId: string;
  presetVersion: string;
  displayName: string;
  provisionedAt: string;
  seats: WorkspaceOfficeSeat[];
};

export const STANDARD_OFFICE_PRESET: OfficePreset = Object.freeze({
  id: 'standard-virtual-office',
  version: '2.0.0',
  displayName: 'Oficina Virtual',
  seats: Object.freeze([
    Object.freeze({ agentId: 'coordinator', kind: 'orchestrator', displayLabel: 'Orquestador', configurable: false }),
    Object.freeze({ agentId: 'lead-intake', kind: 'whatsapp', displayLabel: 'Agente WhatsApp', configurable: false }),
    Object.freeze({ agentId: 'strategy', kind: 'voice', displayLabel: 'Agente de Voz', configurable: false }),
    Object.freeze({ agentId: 'chatbot', kind: 'chatbot', displayLabel: 'Chatbot', configurable: false }),
    Object.freeze({ agentId: 'specialist-1', kind: 'specialist', displayLabel: 'Especialista 1', configurable: true }),
    Object.freeze({ agentId: 'specialist-2', kind: 'specialist', displayLabel: 'Especialista 2', configurable: true }),
    Object.freeze({ agentId: 'specialist-3', kind: 'specialist', displayLabel: 'Especialista 3', configurable: true }),
    Object.freeze({ agentId: 'specialist-4', kind: 'specialist', displayLabel: 'Especialista 4', configurable: true }),
    Object.freeze({ agentId: 'specialist-5', kind: 'specialist', displayLabel: 'Especialista 5', configurable: true }),
    Object.freeze({ agentId: 'specialist-6', kind: 'specialist', displayLabel: 'Especialista 6', configurable: true }),
    Object.freeze({ agentId: 'specialist-7', kind: 'specialist', displayLabel: 'Especialista 7', configurable: true }),
    Object.freeze({ agentId: 'specialist-8', kind: 'specialist', displayLabel: 'Especialista 8', configurable: true }),
  ]),
});

export function provisionWorkspaceOffice(
  workspaceId: string,
  provisionedAt: string,
  preset: OfficePreset = STANDARD_OFFICE_PRESET,
): WorkspaceOfficeConfiguration {
  return {
    workspaceId,
    presetId: preset.id,
    presetVersion: preset.version,
    displayName: preset.displayName,
    provisionedAt,
    seats: preset.seats.map((seat) => ({ ...seat, purpose: null })),
  };
}
