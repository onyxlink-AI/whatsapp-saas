import type { OfficeConfigurationDocument, OfficeConfigurationIssue } from './configuration';
import { validateOfficeConfiguration } from './configuration';
import { CONFIGURABLE_AGENT_IDS, type ConfigurableOfficeAgentId } from './specialist-seats';

// This is the ONLY thing the 3D office (or any non-superadmin surface) is
// allowed to read from the configuration document: a sanitized, per-seat
// list with no instructions, no client-layer text, no draft/history
// metadata — just what a character label needs. A seat with no entry here
// simply means "room empty", not "hidden room" — the room itself always
// renders (see three/officeRoster.ts).

export type OfficeAgentSeatProjection = {
  agentId: ConfigurableOfficeAgentId;
  name: string;
  function: string;
  objective: string;
  color: string;
};

export type OfficeAgentProjection = {
  workspaceId: string;
  officeDisplayName: string;
  revision: number;
  /** Only enabled seats — disabled seats are simply absent, never a fabricated placeholder. */
  seats: OfficeAgentSeatProjection[];
};

export type OfficeAgentProjectionResult =
  | { success: true; projection: OfficeAgentProjection }
  | { success: false; code: 'workspace_mismatch' | 'configuration_not_published' | 'invalid_configuration'; issues?: OfficeConfigurationIssue[] };

function project(document: OfficeConfigurationDocument, workspaceId: string, requirePublished: boolean): OfficeAgentProjectionResult {
  if (document.workspaceId !== workspaceId) return { success: false, code: 'workspace_mismatch' };
  if (requirePublished && document.status !== 'published') return { success: false, code: 'configuration_not_published' };

  const issues = validateOfficeConfiguration(document);
  if (issues.length > 0) return { success: false, code: 'invalid_configuration', issues };

  const seats: OfficeAgentSeatProjection[] = CONFIGURABLE_AGENT_IDS.filter((id) => document.specialists[id].enabled).map((id) => {
    const specialist = document.specialists[id];
    return { agentId: id, name: specialist.name, function: specialist.function, objective: specialist.objective, color: specialist.color };
  });

  return {
    success: true,
    projection: { workspaceId, officeDisplayName: document.officeDisplayName, revision: document.revision, seats },
  };
}

/** Runtime projection: only a published configuration may reach the live office (regular workspace admins/managers). */
export function projectPublishedOfficeAgents(document: OfficeConfigurationDocument, workspaceId: string): OfficeAgentProjectionResult {
  return project(document, workspaceId, true);
}

/** Superadmin-only preview projection. Draft values never reach this from a non-superadmin route. */
export function previewOfficeAgents(document: OfficeConfigurationDocument, workspaceId: string): OfficeAgentProjectionResult {
  return project(document, workspaceId, false);
}
