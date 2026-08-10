import type { OfficeConfigurationDocument, OfficeConfigurationStatus, SpecialistPatch } from '../central-integrations/configuration';
import type { FixedOfficeSeatId, OfficeSeatId } from '../central-integrations/specialist-seats';
import type { VerticalId } from '../central-integrations/specialist-verticals';
import type { OpenRouterStatus, RealIntegrationStatusMap } from '../central-integrations/real-integrations';

// Mirrors OfficeConfigurationCommandInput from the server service — kept as
// an independent type here (never imported from server/office-configuration-service.ts,
// which pulls in node:crypto and must never reach the browser bundle).
export type OfficeConfiguratorCommandInput =
  | { type: 'update_office'; displayName: string }
  | { type: 'update_specialist'; agentId: OfficeSeatId; patch: SpecialistPatch }
  | { type: 'reset_specialist'; agentId: OfficeSeatId }
  | { type: 'update_core_seat_name'; agentId: FixedOfficeSeatId; name: string | null }
  | { type: 'apply_vertical'; verticalId: VerticalId | null }
  | { type: 'publish' }
  | { type: 'restore_revision'; revision: number };

export type OfficeConfigurationHeadResponse = {
  presetId: string;
  presetVersion: string;
  revision: number;
  status: OfficeConfigurationStatus;
  document: OfficeConfigurationDocument;
  updatedAt: string;
  updatedBy: string;
};

export type OfficeConfiguratorLoadResult =
  | { status: 'ok'; head: OfficeConfigurationHeadResponse; realIntegrations: RealIntegrationStatusMap; openRouterStatus: OpenRouterStatus }
  | { status: 'error'; message: string };

export type OfficeConfiguratorCommandResult =
  | { status: 'ok'; document: OfficeConfigurationDocument; realIntegrations: RealIntegrationStatusMap; openRouterStatus: OpenRouterStatus }
  | { status: 'error'; code: string | null; issues?: { field: string; message: string }[]; message: string };

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function fetchOfficeConfiguration(workspaceId: string): Promise<OfficeConfiguratorLoadResult> {
  try {
    const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual/configurator`);
    if (!response.ok) return { status: 'error', message: await readError(response) };
    const body = (await response.json()) as { head: OfficeConfigurationHeadResponse; realIntegrations: RealIntegrationStatusMap; openRouterStatus: OpenRouterStatus };
    return { status: 'ok', head: body.head, realIntegrations: body.realIntegrations, openRouterStatus: body.openRouterStatus };
  } catch {
    return { status: 'error', message: 'No se pudo cargar la configuración real de esta empresa.' };
  }
}

export async function sendOfficeConfigurationCommand(
  workspaceId: string,
  expectedRevision: number,
  command: OfficeConfiguratorCommandInput,
): Promise<OfficeConfiguratorCommandResult> {
  try {
    const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual/configurator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision, command }),
    });
    if (!response.ok) {
      let code: string | null = null;
      let issues: { field: string; message: string }[] | undefined;
      try {
        const body = (await response.json()) as { error?: string; issues?: { field: string; message: string }[] };
        code = body.error ?? null;
        issues = body.issues;
      } catch {
        // ignore — code stays null, generic message below
      }
      return { status: 'error', code, issues, message: code ?? `HTTP ${response.status}` };
    }
    const body = (await response.json()) as { document: OfficeConfigurationDocument; realIntegrations: RealIntegrationStatusMap; openRouterStatus: OpenRouterStatus };
    return { status: 'ok', document: body.document, realIntegrations: body.realIntegrations, openRouterStatus: body.openRouterStatus };
  } catch {
    return { status: 'error', code: null, message: 'No se pudo contactar con el backend de configuración.' };
  }
}
