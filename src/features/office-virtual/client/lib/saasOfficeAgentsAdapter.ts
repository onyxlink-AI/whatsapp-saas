import type { OfficeAgentSeatProjection } from '../central-integrations/office-agent-projection';
import type { FixedOfficeSeatId } from '../central-integrations/specialist-seats';

export type OfficeAgentsRosterResult =
  | { status: 'ok'; seats: OfficeAgentSeatProjection[]; coreSeatDisplayNames: Partial<Record<FixedOfficeSeatId, string>> }
  | { status: 'error'; message: string };

export async function fetchOfficeAgentsRoster(workspaceId: string): Promise<OfficeAgentsRosterResult> {
  try {
    const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual/office-agents`);
    if (!response.ok) return { status: 'error', message: `HTTP ${response.status}` };
    const body = (await response.json()) as {
      projection: { seats: OfficeAgentSeatProjection[]; coreSeatDisplayNames?: Partial<Record<FixedOfficeSeatId, string>> };
    };
    return { status: 'ok', seats: body.projection.seats, coreSeatDisplayNames: body.projection.coreSeatDisplayNames ?? {} };
  } catch {
    return { status: 'error', message: 'No se pudo cargar el equipo real de la oficina.' };
  }
}
