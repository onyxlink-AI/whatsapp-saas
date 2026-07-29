import { CONFIGURABLE_AGENT_IDS, type ConfigurableOfficeAgentId } from './specialist-seats';
import type { SpecialistExtensionId } from './specialist-extensions';
import type { SpecialistSkillId } from './specialist-skills';
import type { SpecialistTemplateId } from './specialist-templates';
import { findOfficeVertical, type OfficeVertical, type VerticalId, type VerticalOnboardingField, type VerticalPromptOverlay } from './specialist-verticals';

// Ported from the Agencia IA prototype (src/lib/verticalApplicationPlan.ts).

export type VerticalApplicationConflict = {
  agentId: ConfigurableOfficeAgentId;
  templateId: SpecialistTemplateId;
  reason: string;
};

export type ProposedSpecialistChange = {
  agentId: ConfigurableOfficeAgentId;
  templateId: SpecialistTemplateId;
  overlay: VerticalPromptOverlay | null;
  /** True when the sector will place this recommended worker in an empty office seat. */
  willInstallTemplate: boolean;
};

export type VerticalApplicationPlan = {
  vertical: OfficeVertical;
  recommendedTemplateIds: SpecialistTemplateId[];
  optionalTemplateIds: SpecialistTemplateId[];
  promptOverlays: VerticalPromptOverlay[];
  recommendedExtensionIds: SpecialistExtensionId[];
  recommendedSkillIds: SpecialistSkillId[];
  pendingConnections: string[];
  addedApprovalRules: string[];
  onboardingFields: VerticalOnboardingField[];
  proposedChanges: ProposedSpecialistChange[];
  conflicts: VerticalApplicationConflict[];
};

/**
 * Pure — never touches any real state. Reads which template is installed on
 * each seat and whether that seat already has client-layer text, and returns
 * a plan to review. Applying a vertical never activates a worker, never
 * publishes, never connects a tool, and never deletes an existing client
 * customization — at most it's flagged here as a conflict to review before
 * confirming.
 */
export function createVerticalApplicationPlan(
  verticalId: VerticalId,
  appliedTemplateByAgent: Partial<Record<ConfigurableOfficeAgentId, SpecialistTemplateId>>,
  clientPromptLayerByAgent: Partial<Record<ConfigurableOfficeAgentId, string>>,
): VerticalApplicationPlan | null {
  const vertical = findOfficeVertical(verticalId);
  if (!vertical) return null;

  const relevantTemplateIds = new Set([...vertical.recommendedTemplateIds, ...vertical.optionalTemplateIds]);
  const proposedChanges: ProposedSpecialistChange[] = [];
  const conflicts: VerticalApplicationConflict[] = [];
  const installedTemplateIds = new Set<SpecialistTemplateId>();
  const occupiedAgentIds = new Set<ConfigurableOfficeAgentId>();

  for (const [agentIdKey, templateId] of Object.entries(appliedTemplateByAgent)) {
    if (!templateId) continue;
    const agentId = agentIdKey as ConfigurableOfficeAgentId;
    occupiedAgentIds.add(agentId);
    installedTemplateIds.add(templateId);
    if (!relevantTemplateIds.has(templateId)) continue;
    const overlay = vertical.promptOverlays.find((candidate) => candidate.templateId === templateId) ?? null;
    proposedChanges.push({ agentId, templateId, overlay, willInstallTemplate: false });

    const existingClientLayer = clientPromptLayerByAgent[agentId];
    if (existingClientLayer && existingClientLayer.trim().length > 0) {
      conflicts.push({
        agentId,
        templateId,
        reason: 'Este puesto ya tiene una personalización de cliente escrita. Aplicar el sector no la borrará — revísala después de aplicar por si conviene ajustarla al nuevo sector.',
      });
    }
  }

  // Sector-first onboarding: fill empty seats with every recommended worker
  // that is not installed yet. Optional workers are never installed silently.
  const emptyAgentIds = CONFIGURABLE_AGENT_IDS.filter((agentId) => !occupiedAgentIds.has(agentId));
  for (const templateId of vertical.recommendedTemplateIds) {
    if (installedTemplateIds.has(templateId)) continue;
    const agentId = emptyAgentIds.shift();
    if (!agentId) break;
    const overlay = vertical.promptOverlays.find((candidate) => candidate.templateId === templateId) ?? null;
    proposedChanges.push({ agentId, templateId, overlay, willInstallTemplate: true });
    installedTemplateIds.add(templateId);
  }

  return {
    vertical,
    recommendedTemplateIds: vertical.recommendedTemplateIds,
    optionalTemplateIds: vertical.optionalTemplateIds,
    promptOverlays: vertical.promptOverlays,
    recommendedExtensionIds: vertical.extensionIds,
    recommendedSkillIds: vertical.recommendedSkillIds,
    pendingConnections: vertical.connections.map((connection) => connection.connectionId),
    addedApprovalRules: vertical.approvalRules,
    onboardingFields: vertical.onboardingFields,
    proposedChanges,
    conflicts,
  };
}
