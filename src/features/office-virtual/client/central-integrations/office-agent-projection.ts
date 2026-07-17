import type { Agent } from '../types';
import type { OfficeConfigurationDocument, OfficeConfigurationIssue } from './configuration';
import { validateOfficeConfiguration } from './configuration';

export type OfficeAgentProjection = {
  workspaceId: string;
  officeDisplayName: string;
  presetId: string;
  presetVersion: string;
  revision: number;
  agents: Agent[];
};

export type OfficeAgentProjectionResult =
  | { success: true; projection: OfficeAgentProjection }
  | {
      success: false;
      code: 'workspace_mismatch' | 'configuration_not_published' | 'invalid_configuration';
      issues?: OfficeConfigurationIssue[];
    };

function project(
  baseAgents: readonly Agent[],
  configuration: OfficeConfigurationDocument,
  workspaceId: string,
  requirePublished: boolean,
): OfficeAgentProjectionResult {
  if (configuration.workspaceId !== workspaceId) {
    return { success: false, code: 'workspace_mismatch' };
  }
  if (requirePublished && configuration.status !== 'published') {
    return { success: false, code: 'configuration_not_published' };
  }

  const issues = validateOfficeConfiguration(configuration);
  if (issues.length > 0) {
    return { success: false, code: 'invalid_configuration', issues };
  }

  return {
    success: true,
    projection: {
      workspaceId,
      officeDisplayName: configuration.officeDisplayName,
      presetId: configuration.presetId,
      presetVersion: configuration.presetVersion,
      revision: configuration.revision,
      agents: baseAgents.map((agent) => {
        if (!agent.seat.configurable) return { ...agent };

        const specialist = configuration.specialists[agent.id as keyof typeof configuration.specialists];
        if (!specialist) return { ...agent };

        return {
          ...agent,
          name: specialist.name,
          role: specialist.function,
          description: specialist.objective,
        };
      }),
    },
  };
}

/** Runtime projection: only a published configuration may reach the live office. */
export function projectPublishedOfficeAgents(
  baseAgents: readonly Agent[],
  configuration: OfficeConfigurationDocument,
  workspaceId: string,
): OfficeAgentProjectionResult {
  return project(baseAgents, configuration, workspaceId, true);
}

/** Admin-only preview projection. Draft values never become runtime state through this entrypoint. */
export function previewOfficeAgents(
  baseAgents: readonly Agent[],
  configuration: OfficeConfigurationDocument,
  workspaceId: string,
): OfficeAgentProjectionResult {
  return project(baseAgents, configuration, workspaceId, false);
}
