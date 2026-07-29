import { useEffect, useState } from 'react';
import { STANDARD_OFFICE_PRESET } from '../central-integrations/preset';
import { CONFIGURABLE_AGENT_IDS, type ConfigurableOfficeAgentId } from '../central-integrations/specialist-seats';
import type {
  OfficeConfigurationDocument,
  OfficeConfigurationStatus,
  OfficeSpecialistConfiguration,
} from '../central-integrations/configuration';
import { defaultSpecialist } from '../central-integrations/configuration';
import type { SpecialistTemplateId } from '../central-integrations/specialist-templates';
import type { VerticalId } from '../central-integrations/specialist-verticals';
import { createVerticalApplicationPlan, type VerticalApplicationPlan } from '../central-integrations/vertical-application-plan';
import {
  fetchOfficeConfiguration,
  sendOfficeConfigurationCommand,
  type OfficeConfiguratorCommandInput,
  type OfficeConfiguratorCommandResult,
} from '../lib/saasOfficeConfigurationAdapter';
import type { OpenRouterStatus, RealIntegrationStatusMap } from '../central-integrations/real-integrations';

// Adapter hook for the real, server-persisted Oficina Virtual configuration
// (src/app/api/workspace/[id]/office-virtual/configurator). Local drafts
// only exist so typing doesn't send a request per keystroke — "Guardar"
// commits every changed seat as one update_specialist command per seat,
// still gated server-side by the same optimistic-concurrency revision check
// the pure reducer enforces. Template/sector application and publish/reset/
// restore all go straight to the server (no local staging), since they
// affect fields the admin didn't necessarily just type.

export type SpecialistDraft = Omit<OfficeSpecialistConfiguration, 'agentId'>;

function cloneSpecialistDrafts(
  specialists: Record<ConfigurableOfficeAgentId, OfficeSpecialistConfiguration>,
): Record<ConfigurableOfficeAgentId, SpecialistDraft> {
  const result: Partial<Record<ConfigurableOfficeAgentId, SpecialistDraft>> = {};
  for (const agentId of CONFIGURABLE_AGENT_IDS) {
    const { agentId: _drop, ...draft } = specialists[agentId];
    result[agentId] = { ...draft, allowedActions: [...draft.allowedActions], extensions: [...draft.extensions], skills: [...draft.skills] };
  }
  return result as Record<ConfigurableOfficeAgentId, SpecialistDraft>;
}

function sameSpecialist(a: OfficeSpecialistConfiguration, b: SpecialistDraft): boolean {
  return (
    a.enabled === b.enabled &&
    a.templateId === b.templateId &&
    a.name === b.name &&
    a.color === b.color &&
    a.function === b.function &&
    a.objective === b.objective &&
    a.instructions === b.instructions &&
    a.clientLayer === b.clientLayer &&
    a.approvalPolicy === b.approvalPolicy &&
    a.allowedActions.length === b.allowedActions.length &&
    a.allowedActions.every((action) => b.allowedActions.includes(action)) &&
    a.extensions.length === b.extensions.length &&
    a.extensions.every((id) => b.extensions.includes(id)) &&
    a.skills.length === b.skills.length &&
    a.skills.every((id) => b.skills.includes(id))
  );
}

function emptyDocument(workspaceId: string): OfficeConfigurationDocument {
  const specialists = Object.fromEntries(
    CONFIGURABLE_AGENT_IDS.map((agentId) => [agentId, defaultSpecialist(agentId)]),
  ) as OfficeConfigurationDocument['specialists'];
  return {
    workspaceId,
    presetId: STANDARD_OFFICE_PRESET.id,
    presetVersion: STANDARD_OFFICE_PRESET.version,
    revision: 0,
    status: 'draft',
    officeDisplayName: STANDARD_OFFICE_PRESET.displayName,
    sectorId: null,
    specialists,
    updatedAt: new Date(0).toISOString(),
    updatedBy: 'system',
  };
}

export type OfficeConfigurator = {
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  presetVersion: string;
  status: OfficeConfigurationStatus;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  sectorId: VerticalId | null;
  officeNameDraft: string;
  setOfficeNameDraft: (name: string) => void;
  specialistDrafts: Record<ConfigurableOfficeAgentId, SpecialistDraft>;
  /** Live status of the 4 execution-tier integrations (Ajustes → Integraciones) — the only source specialist readiness reads. */
  realIntegrations: RealIntegrationStatusMap;
  /** OpenRouter's own canonical status — not a boolean, see real-integrations.ts. */
  openRouterStatus: OpenRouterStatus;
  updateSpecialistDraft: (agentId: ConfigurableOfficeAgentId, patch: Partial<SpecialistDraft>) => void;
  resetSpecialist: (agentId: ConfigurableOfficeAgentId) => void;
  lastResult: OfficeConfiguratorCommandResult | null;
  hasUnsavedChanges: boolean;
  save: () => void;
  publish: () => void;
  previewVertical: (verticalId: VerticalId) => VerticalApplicationPlan | null;
  applyVertical: (verticalId: VerticalId | null) => void;
  restoreRevision: (revision: number) => void;
};

export function useOfficeConfigurator(workspaceId: string, enabled = true): OfficeConfigurator {
  const [document, setDocument] = useState<OfficeConfigurationDocument>(() => emptyDocument(workspaceId));
  const [presetVersion, setPresetVersion] = useState(STANDARD_OFFICE_PRESET.version);
  const [loading, setLoading] = useState(enabled);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [officeNameDraft, setOfficeNameDraft] = useState('');
  const [specialistDrafts, setSpecialistDrafts] = useState<Record<ConfigurableOfficeAgentId, SpecialistDraft>>(() =>
    cloneSpecialistDrafts(emptyDocument(workspaceId).specialists),
  );
  const [realIntegrations, setRealIntegrations] = useState<RealIntegrationStatusMap>({});
  const [openRouterStatus, setOpenRouterStatus] = useState<OpenRouterStatus>('not_configured');
  const [lastResult, setLastResult] = useState<OfficeConfiguratorCommandResult | null>(null);

  const applyDocument = (next: OfficeConfigurationDocument) => {
    setDocument(next);
    setOfficeNameDraft(next.officeDisplayName);
    setSpecialistDrafts(cloneSpecialistDrafts(next.specialists));
  };

  useEffect(() => {
    // The configurator API is superadmin-only server-side (by design — see
    // office-virtual/configurator/route.ts) — skip the fetch entirely for
    // everyone else instead of letting every workspace admin/client trigger
    // an expected-but-noisy 403 on every Oficina Virtual page load.
    if (!enabled) return;
    let cancelled = false;
    fetchOfficeConfiguration(workspaceId).then((result) => {
      if (cancelled) return;
      if (result.status === 'error') {
        setLoadError(result.message);
      } else {
        setPresetVersion(result.head.presetVersion);
        applyDocument(result.head.document);
        setRealIntegrations(result.realIntegrations);
        setOpenRouterStatus(result.openRouterStatus);
        setLoadError(null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, enabled]);

  const hasUnsavedChanges =
    officeNameDraft.trim() !== document.officeDisplayName ||
    CONFIGURABLE_AGENT_IDS.some((agentId) => !sameSpecialist(document.specialists[agentId], specialistDrafts[agentId]));

  const updateSpecialistDraft = (agentId: ConfigurableOfficeAgentId, patch: Partial<SpecialistDraft>) => {
    setSpecialistDrafts((prev) => ({ ...prev, [agentId]: { ...prev[agentId], ...patch } }));
  };

  // `revisionOverride` matters when a caller just committed other changes
  // in this same action (e.g. `publish` calling `save` first): `document`
  // is a React state closure that only reflects those changes on the next
  // render, so reading `document.revision` here would send a now-stale
  // revision and get a spurious 409 from the server's own concurrency
  // check — not a real conflict, just this hook racing its own state update.
  const runCommand = async (command: OfficeConfiguratorCommandInput, revisionOverride?: number) => {
    setSaving(true);
    const result = await sendOfficeConfigurationCommand(workspaceId, revisionOverride ?? document.revision, command);
    setSaving(false);
    setLastResult(result);
    if (result.status === 'ok') {
      applyDocument(result.document);
      setRealIntegrations(result.realIntegrations);
      setOpenRouterStatus(result.openRouterStatus);
    }
    return result;
  };

  /** Returns the final persisted document (or null if a command failed partway), so callers like `publish` can chain off the real latest revision instead of the stale closure value. */
  const save = async (): Promise<OfficeConfigurationDocument | null> => {
    if (saving) return document;
    let revision = document.revision;
    let latestDocument = document;

    if (officeNameDraft.trim() !== latestDocument.officeDisplayName) {
      setSaving(true);
      const result = await sendOfficeConfigurationCommand(workspaceId, revision, { type: 'update_office', displayName: officeNameDraft });
      setSaving(false);
      setLastResult(result);
      if (result.status !== 'ok') return null;
      latestDocument = result.document;
      revision = result.document.revision;
      setDocument(latestDocument);
      setRealIntegrations(result.realIntegrations);
      setOpenRouterStatus(result.openRouterStatus);
    }

    for (const agentId of CONFIGURABLE_AGENT_IDS) {
      const draft = specialistDrafts[agentId];
      if (sameSpecialist(latestDocument.specialists[agentId], draft)) continue;

      setSaving(true);
      const result = await sendOfficeConfigurationCommand(workspaceId, revision, { type: 'update_specialist', agentId, patch: draft });
      setSaving(false);
      setLastResult(result);
      if (result.status !== 'ok') return null;
      latestDocument = result.document;
      revision = result.document.revision;
      setDocument(latestDocument);
      setRealIntegrations(result.realIntegrations);
      setOpenRouterStatus(result.openRouterStatus);
    }

    applyDocument(latestDocument);
    return latestDocument;
  };

  const publish = async () => {
    const saved = await save();
    if (!saved) return;
    await runCommand({ type: 'publish' }, saved.revision);
  };

  // reset/applyVertical/restoreRevision all replace the ENTIRE document from
  // the server response (applyDocument resets every specialist's local
  // draft, not just the one being acted on) — so each MUST save() first.
  // Without this, switching a sector or restoring a revision while another
  // seat had unsaved edits pending would silently discard that other seat's
  // work the moment the server's fresh document overwrote local state.
  const resetSpecialist = async (agentId: ConfigurableOfficeAgentId) => {
    const saved = await save();
    if (!saved) return;
    await runCommand({ type: 'reset_specialist', agentId }, saved.revision);
  };

  const previewVertical = (verticalId: VerticalId): VerticalApplicationPlan | null => {
    const appliedTemplateByAgent = Object.fromEntries(
      CONFIGURABLE_AGENT_IDS.map((id) => [id, document.specialists[id].templateId ?? undefined]),
    ) as Partial<Record<ConfigurableOfficeAgentId, SpecialistTemplateId>>;
    const clientPromptLayerByAgent = Object.fromEntries(
      CONFIGURABLE_AGENT_IDS.map((id) => [id, document.specialists[id].clientLayer]),
    ) as Partial<Record<ConfigurableOfficeAgentId, string>>;
    return createVerticalApplicationPlan(verticalId, appliedTemplateByAgent, clientPromptLayerByAgent);
  };

  const applyVertical = async (verticalId: VerticalId | null) => {
    const saved = await save();
    if (!saved) return;
    await runCommand({ type: 'apply_vertical', verticalId }, saved.revision);
  };

  const restoreRevision = async (revision: number) => {
    const saved = await save();
    if (!saved) return;
    await runCommand({ type: 'restore_revision', revision }, saved.revision);
  };

  return {
    loading,
    loadError,
    saving,
    presetVersion,
    status: document.status,
    revision: document.revision,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedBy,
    sectorId: document.sectorId,
    officeNameDraft,
    setOfficeNameDraft,
    specialistDrafts,
    realIntegrations,
    openRouterStatus,
    updateSpecialistDraft,
    resetSpecialist,
    lastResult,
    hasUnsavedChanges,
    save,
    publish,
    previewVertical,
    applyVertical,
    restoreRevision,
  };
}
