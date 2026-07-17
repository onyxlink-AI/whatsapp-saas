import type { AgentId } from '../../schemas';

export type OfficePresetSeatKind = 'orchestrator' | 'whatsapp' | 'voice' | 'specialist';

export type OfficePresetSeat = {
  agentId: AgentId;
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

export type OfficeSeatCustomization = {
  agentId: AgentId;
  displayLabel?: string;
  purpose?: string | null;
};

export type OfficeCustomizationRequest = {
  workspaceId: string;
  displayName?: string;
  seatOverrides?: OfficeSeatCustomization[];
};

export type OfficeCustomizationResult =
  | { success: true; configuration: WorkspaceOfficeConfiguration }
  | {
      success: false;
      code: 'workspace_mismatch' | 'unknown_seat' | 'protected_seat' | 'invalid_label';
      agentId?: AgentId;
    };

export const STANDARD_OFFICE_PRESET: OfficePreset = Object.freeze({
  id: 'standard-virtual-office',
  version: '1.0.0',
  displayName: 'Oficina Virtual',
  seats: Object.freeze([
    Object.freeze({ agentId: 'coordinator', kind: 'orchestrator', displayLabel: 'Orquestador', configurable: false }),
    Object.freeze({ agentId: 'lead-intake', kind: 'whatsapp', displayLabel: 'Agente WhatsApp', configurable: false }),
    Object.freeze({ agentId: 'strategy', kind: 'voice', displayLabel: 'Agente de Voz', configurable: false }),
    Object.freeze({ agentId: 'proposal', kind: 'specialist', displayLabel: 'Especialista 1', configurable: true }),
    Object.freeze({ agentId: 'operations', kind: 'specialist', displayLabel: 'Especialista 2', configurable: true }),
    Object.freeze({ agentId: 'content', kind: 'specialist', displayLabel: 'Especialista 3', configurable: true }),
    Object.freeze({ agentId: 'review-qa', kind: 'specialist', displayLabel: 'Especialista 4', configurable: true }),
  ]),
});

/** Temporary compatibility alias while the configurator migrates its import. */
export const ONYXLINK_STANDARD_OFFICE_PRESET = STANDARD_OFFICE_PRESET;

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

export function customizeWorkspaceOffice(
  current: WorkspaceOfficeConfiguration,
  request: OfficeCustomizationRequest,
): OfficeCustomizationResult {
  if (request.workspaceId !== current.workspaceId) {
    return { success: false, code: 'workspace_mismatch' };
  }

  const overrides = new Map((request.seatOverrides ?? []).map((item) => [item.agentId, item]));
  for (const override of overrides.values()) {
    const seat = current.seats.find((item) => item.agentId === override.agentId);
    if (!seat) return { success: false, code: 'unknown_seat', agentId: override.agentId };
    if (!seat.configurable) {
      return { success: false, code: 'protected_seat', agentId: override.agentId };
    }
    if (override.displayLabel !== undefined && override.displayLabel.trim().length === 0) {
      return { success: false, code: 'invalid_label', agentId: override.agentId };
    }
  }

  const displayName = request.displayName?.trim();
  if (displayName !== undefined && displayName.length === 0) {
    return { success: false, code: 'invalid_label' };
  }

  return {
    success: true,
    configuration: {
      ...current,
      displayName: displayName ?? current.displayName,
      seats: current.seats.map((seat) => {
        const override = overrides.get(seat.agentId);
        if (!override) return { ...seat };
        return {
          ...seat,
          displayLabel: override.displayLabel?.trim() ?? seat.displayLabel,
          purpose:
            override.purpose === undefined ? seat.purpose : override.purpose?.trim() || null,
        };
      }),
    },
  };
}
