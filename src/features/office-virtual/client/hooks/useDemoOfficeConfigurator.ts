import { useState } from 'react';
import {
  defaultSpecialist,
  type OfficeConfigurationDocument,
  type OfficeSpecialistConfiguration,
} from '../central-integrations/configuration';
import { STANDARD_OFFICE_PRESET } from '../central-integrations/preset';
import { CONFIGURABLE_AGENT_IDS, type ConfigurableOfficeAgentId, type FixedOfficeSeatId } from '../central-integrations/specialist-seats';
import { findSpecialistTemplate, type SpecialistTemplateId } from '../central-integrations/specialist-templates';
import type { VerticalId } from '../central-integrations/specialist-verticals';
import { createVerticalApplicationPlan, type VerticalApplicationPlan } from '../central-integrations/vertical-application-plan';
import { createDemoOfficeConfiguration } from '../demo/demoPresentationData';
import type { OfficeConfigurator, SpecialistDraft } from './useOfficeConfigurator';

const DEMO_INTEGRATIONS = {
  ycloud: true,
  highlevel: true,
  google_calendar: true,
  airtable: true,
} as const;

function cloneDrafts(
  specialists: Record<ConfigurableOfficeAgentId, OfficeSpecialistConfiguration>,
): Record<ConfigurableOfficeAgentId, SpecialistDraft> {
  return Object.fromEntries(CONFIGURABLE_AGENT_IDS.map((agentId) => {
    const { agentId: _drop, ...draft } = specialists[agentId];
    return [agentId, {
      ...draft,
      allowedActions: [...draft.allowedActions],
      extensions: [...draft.extensions],
      skills: [...draft.skills],
    }];
  })) as Record<ConfigurableOfficeAgentId, SpecialistDraft>;
}

function sameDraft(specialist: OfficeSpecialistConfiguration, draft: SpecialistDraft): boolean {
  return JSON.stringify({ ...specialist, agentId: undefined }) === JSON.stringify(draft);
}

/**
 * Fully interactive showroom configurator. It uses the same domain shapes as
 * production but never calls the superadmin API and never persists outside the
 * current browser session.
 */
export function useDemoOfficeConfigurator(workspaceId: string, enabled: boolean): OfficeConfigurator {
  const [document, setDocument] = useState<OfficeConfigurationDocument>(() =>
    enabled ? createDemoOfficeConfiguration(workspaceId) : createDemoOfficeConfiguration(`disabled-${workspaceId}`),
  );
  const [officeNameDraft, setOfficeNameDraft] = useState(document.officeDisplayName);
  const [specialistDrafts, setSpecialistDrafts] = useState(() => cloneDrafts(document.specialists));
  const [lastResult, setLastResult] = useState<OfficeConfigurator['lastResult']>(null);

  const updateSpecialistDraft = (agentId: ConfigurableOfficeAgentId, patch: Partial<SpecialistDraft>) => {
    setSpecialistDrafts((previous) => ({
      ...previous,
      [agentId]: { ...previous[agentId], ...patch },
    }));
  };

  const buildDocument = (status: OfficeConfigurationDocument['status']): OfficeConfigurationDocument => ({
    ...document,
    workspaceId,
    revision: document.revision + 1,
    status,
    officeDisplayName: officeNameDraft.trim() || STANDARD_OFFICE_PRESET.displayName,
    specialists: Object.fromEntries(CONFIGURABLE_AGENT_IDS.map((agentId) => [
      agentId,
      {
        ...specialistDrafts[agentId],
        agentId,
        allowedActions: [...specialistDrafts[agentId].allowedActions],
        extensions: [...specialistDrafts[agentId].extensions],
        skills: [...specialistDrafts[agentId].skills],
      },
    ])) as OfficeConfigurationDocument['specialists'],
    updatedAt: new Date().toISOString(),
    updatedBy: 'demo@onyxlinkpanel.com',
  });

  const commit = (status: OfficeConfigurationDocument['status']) => {
    const next = buildDocument(status);
    setDocument(next);
    setSpecialistDrafts(cloneDrafts(next.specialists));
    setLastResult({
      status: 'ok',
      document: next,
      realIntegrations: DEMO_INTEGRATIONS,
      openRouterStatus: 'verified',
    });
    return next;
  };

  const resetSpecialist = (agentId: ConfigurableOfficeAgentId) => {
    const { agentId: _agentId, ...draft } = defaultSpecialist(agentId);
    setSpecialistDrafts((previous) => ({ ...previous, [agentId]: draft }));
  };

  /** Fase 3 — demo local: se aplica de inmediato, sin la ronda save()→command() del hook real. */
  const updateCoreSeatName = (agentId: FixedOfficeSeatId, name: string | null) => {
    setDocument((previous) => {
      const trimmed = name?.trim();
      const nextNames = { ...previous.coreSeatDisplayNames };
      if (trimmed) nextNames[agentId] = trimmed;
      else delete nextNames[agentId];
      return { ...previous, coreSeatDisplayNames: nextNames, revision: previous.revision + 1 };
    });
  };

  const previewVertical = (verticalId: VerticalId): VerticalApplicationPlan | null => {
    const appliedTemplateByAgent = Object.fromEntries(
      CONFIGURABLE_AGENT_IDS.map((agentId) => [agentId, specialistDrafts[agentId].templateId ?? undefined]),
    ) as Partial<Record<ConfigurableOfficeAgentId, SpecialistTemplateId>>;
    const clientPromptLayerByAgent = Object.fromEntries(
      CONFIGURABLE_AGENT_IDS.map((agentId) => [agentId, specialistDrafts[agentId].clientLayer]),
    ) as Partial<Record<ConfigurableOfficeAgentId, string>>;
    return createVerticalApplicationPlan(verticalId, appliedTemplateByAgent, clientPromptLayerByAgent);
  };

  const applyVertical = (verticalId: VerticalId | null) => {
    if (verticalId === null) {
      setDocument((previous) => ({ ...previous, sectorId: null, status: 'draft' }));
      return;
    }
    const plan = previewVertical(verticalId);
    if (!plan) return;
    setSpecialistDrafts((previous) => {
      const next = { ...previous };
      for (const change of plan.proposedChanges) {
        if (!change.willInstallTemplate) continue;
        const template = findSpecialistTemplate(change.templateId);
        if (!template) continue;
        next[change.agentId] = {
          ...next[change.agentId],
          templateId: template.id,
          name: template.name,
          function: template.function,
          objective: template.objective,
          instructions: template.instructions,
          allowedActions: [...template.allowedActions],
          approvalPolicy: template.approvalPolicy,
        };
      }
      return next;
    });
    setDocument((previous) => ({ ...previous, sectorId: verticalId, status: 'draft' }));
  };

  const hasUnsavedChanges =
    officeNameDraft.trim() !== document.officeDisplayName ||
    CONFIGURABLE_AGENT_IDS.some((agentId) => !sameDraft(document.specialists[agentId], specialistDrafts[agentId]));

  return {
    loading: false,
    loadError: null,
    saving: false,
    presetVersion: STANDARD_OFFICE_PRESET.version,
    status: document.status,
    revision: document.revision,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedBy,
    sectorId: document.sectorId,
    officeNameDraft,
    setOfficeNameDraft,
    specialistDrafts,
    realIntegrations: DEMO_INTEGRATIONS,
    openRouterStatus: 'verified',
    coreSeatDisplayNames: document.coreSeatDisplayNames ?? {},
    updateSpecialistDraft,
    resetSpecialist,
    updateCoreSeatName,
    lastResult,
    hasUnsavedChanges,
    save: () => { commit('draft'); },
    publish: () => { commit('published'); },
    previewVertical,
    applyVertical,
    restoreRevision: () => {
      const next = createDemoOfficeConfiguration(workspaceId);
      setDocument(next);
      setOfficeNameDraft(next.officeDisplayName);
      setSpecialistDrafts(cloneDrafts(next.specialists));
      setLastResult({
        status: 'ok',
        document: next,
        realIntegrations: DEMO_INTEGRATIONS,
        openRouterStatus: 'verified',
      });
    },
  };
}
