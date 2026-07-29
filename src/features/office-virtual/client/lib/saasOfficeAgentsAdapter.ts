import type { OfficeAgentSeatProjection } from '../central-integrations/office-agent-projection';

export type OfficeAgentsRosterResult =
  | { status: 'ok'; seats: OfficeAgentSeatProjection[] }
  | { status: 'error'; message: string };

export async function fetchOfficeAgentsRoster(workspaceId: string): Promise<OfficeAgentsRosterResult> {
  try {
    const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual/office-agents`);
    if (!response.ok) return { status: 'error', message: `HTTP ${response.status}` };
    const body = (await response.json()) as { projection: { seats: OfficeAgentSeatProjection[] } };
    return { status: 'ok', seats: body.projection.seats };
  } catch {
    return { status: 'error', message: 'No se pudo cargar el equipo real de la oficina.' };
  }
}
