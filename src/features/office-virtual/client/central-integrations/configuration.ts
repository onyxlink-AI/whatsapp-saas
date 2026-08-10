import type { WorkspaceOfficeConfiguration } from './preset';
import {
  CONFIGURABLE_AGENT_IDS,
  DEFAULT_SPECIALIST_COLORS,
  FIXED_AGENT_IDS,
  type ConfigurableOfficeAgentId,
  type FixedOfficeSeatId,
  type OfficeSeatId,
} from './specialist-seats';
import { findSpecialistTemplate, type SpecialistTemplateId } from './specialist-templates';
import type { SpecialistExtensionId } from './specialist-extensions';
import type { SpecialistSkillId } from './specialist-skills';
import type { VerticalId } from './specialist-verticals';
import { createVerticalApplicationPlan } from './vertical-application-plan';
import type { OfficeViewer } from './types';

// v2 configuration document. Supersedes the v1 shape (4 pipeline-role seats,
// 6 fields, no enabled/template/color/sector/extensions/skills/client-layer)
// — that generation is not persisted going forward, per explicit direction
// not to keep porting the old 7-agent/6-field configurator as-is.

export const OFFICE_SPECIALIST_ACTIONS = [
  'read_contacts',
  'read_memory',
  'draft_message',
  'send_message',
  'create_task',
  'update_pipeline',
  'schedule_call',
  'request_handoff',
  'read_content',
  'create_content_draft',
  'update_content_draft',
] as const;

export type OfficeSpecialistAction = (typeof OFFICE_SPECIALIST_ACTIONS)[number];
export type OfficeApprovalPolicy = 'always' | 'sensitive_only' | 'never';
export type OfficeConfigurationStatus = 'draft' | 'published';
export type { ConfigurableOfficeAgentId };

export type OfficeSpecialistConfiguration = {
  agentId: ConfigurableOfficeAgentId;
  enabled: boolean;
  templateId: SpecialistTemplateId | null;
  name: string;
  color: string;
  function: string;
  objective: string;
  /** The working instructions actually used — pre-filled from the template, directly editable. */
  instructions: string;
  /** The only layer the client ever edits directly. Never touched by apply_vertical. */
  clientLayer: string;
  /** OpenRouter model id this specialist uses when delegated to — null falls back to the workspace's default model (Orquestador → Modelos de especialistas). Set directly here, not through the Orquestador's legacy per-seat overrides. */
  model: string | null;
  extensions: SpecialistExtensionId[];
  skills: SpecialistSkillId[];
  allowedActions: OfficeSpecialistAction[];
  approvalPolicy: OfficeApprovalPolicy;
};

export type OfficeConfigurationDocument = {
  workspaceId: string;
  presetId: string;
  presetVersion: string;
  revision: number;
  status: OfficeConfigurationStatus;
  officeDisplayName: string;
  sectorId: VerticalId | null;
  specialists: Record<ConfigurableOfficeAgentId, OfficeSpecialistConfiguration>;
  /**
   * Fase 3 — nombre visible de los 4 puestos fijos (Orquestador/WhatsApp/
   * Voz/Chatbot), configurable igual que el de un especialista, PERO nunca
   * su función/objetivo/instrucciones/color — esos siguen reutilizando la
   * configuración real del SaaS, protegida (ver `protected_seat` más
   * abajo). Una clave ausente significa "usa el nombre por defecto", nunca
   * "nombre vacío" — el fallback vive en `officeRoster.ts`. Opcional para
   * que un documento persistido ANTES de esta fase (sin esta clave en su
   * JSONB) siga siendo válido tal cual: undefined, nunca un objeto vacío
   * fabricado que pudiera confundirse con "todos los puestos ya revisados".
   */
  coreSeatDisplayNames?: Partial<Record<FixedOfficeSeatId, string>>;
  updatedAt: string;
  updatedBy: string;
};

/** Mismo límite que el nombre de un especialista (`specialists.*.name`) — un nombre visible es un nombre visible, sin importar si el puesto es fijo o configurable. */
export const CORE_SEAT_NAME_MAX_LENGTH = 80;

export type OfficeConfigurationHistoryAction =
  | 'provisioned'
  | 'office_updated'
  | 'specialist_updated'
  | 'specialist_reset'
  | 'vertical_applied'
  | 'published'
  | 'revision_restored'
  | 'core_seat_name_updated';

type CommandBase = {
  workspaceId: string;
  expectedRevision: number;
  actor: OfficeViewer;
  occurredAt: string;
};

export type SpecialistPatch = Partial<Omit<OfficeSpecialistConfiguration, 'agentId'>>;

export type OfficeConfigurationCommand =
  | (CommandBase & { type: 'update_office'; displayName: string })
  /** `openRouterConnected` is computed server-side right before the reducer runs — the pure reducer never queries anything itself, and a client can never claim it's connected when it isn't. */
  | (CommandBase & { type: 'update_specialist'; agentId: OfficeSeatId; patch: SpecialistPatch; openRouterConnected: boolean })
  | (CommandBase & { type: 'reset_specialist'; agentId: OfficeSeatId })
  /**
   * Único cambio permitido sobre un puesto fijo (Orquestador/WhatsApp/Voz/
   * Chatbot) — SOLO el nombre visible, nunca función/objetivo/color/
   * instrucciones, que siguen viniendo de la configuración real del SaaS.
   * `name: null` borra el override y vuelve al nombre por defecto.
   */
  | (CommandBase & { type: 'update_core_seat_name'; agentId: FixedOfficeSeatId; name: string | null })
  | (CommandBase & { type: 'apply_vertical'; verticalId: VerticalId | null })
  | (CommandBase & { type: 'publish' })
  /** `sourceDocument` is fetched by the server from the revisions table before the command is applied — the pure reducer never needs to hold history itself. */
  | (CommandBase & { type: 'restore_revision'; revision: number; sourceDocument: OfficeConfigurationDocument });

export type OfficeConfigurationIssue = { field: string; message: string };

export type OfficeConfigurationMutationResult =
  | { success: true; document: OfficeConfigurationDocument; action: OfficeConfigurationHistoryAction; sourceRevision: number | null }
  | {
      success: false;
      code:
        | 'unauthorized'
        | 'workspace_mismatch'
        | 'stale_revision'
        | 'unknown_specialist'
        | 'protected_seat'
        | 'unknown_vertical'
        | 'revision_mismatch'
        | 'invalid_configuration'
        | 'openrouter_not_connected';
      issues?: OfficeConfigurationIssue[];
    };

const ACTION_SET = new Set<string>(OFFICE_SPECIALIST_ACTIONS);
const APPROVAL_POLICY_SET = new Set<string>(['always', 'sensitive_only', 'never']);

function cloneDocument(document: OfficeConfigurationDocument): OfficeConfigurationDocument {
  return {
    ...document,
    specialists: Object.fromEntries(
      Object.entries(document.specialists).map(([agentId, specialist]) => [
        agentId,
        { ...specialist, allowedActions: [...specialist.allowedActions], extensions: [...specialist.extensions], skills: [...specialist.skills] },
      ]),
    ) as OfficeConfigurationDocument['specialists'],
    // Copia propia — de lo contrario `next.coreSeatDisplayNames` seguiría
    // siendo LA MISMA referencia que `current.coreSeatDisplayNames`, y
    // mutarla rompería la inmutabilidad que el resto de este reductor da
    // por hecha (current nunca cambia bajo los pies de quien la conserva).
    coreSeatDisplayNames: { ...document.coreSeatDisplayNames },
  };
}

export function defaultSpecialist(agentId: ConfigurableOfficeAgentId): OfficeSpecialistConfiguration {
  const index = CONFIGURABLE_AGENT_IDS.indexOf(agentId) + 1;
  return {
    agentId,
    enabled: false,
    templateId: null,
    name: `Especialista ${index}`,
    color: DEFAULT_SPECIALIST_COLORS[agentId],
    function: 'Puesto sin configurar',
    objective: 'Elige una plantilla para preparar este puesto.',
    instructions: 'Trabaja solo dentro de las acciones y aprobaciones configuradas.',
    clientLayer: '',
    model: null,
    extensions: [],
    skills: [],
    allowedActions: ['read_contacts', 'read_memory', 'create_task', 'request_handoff'],
    approvalPolicy: 'sensitive_only',
  };
}

function validateText(issues: OfficeConfigurationIssue[], field: string, value: string, maxLength: number): void {
  const length = value.trim().length;
  if (length === 0) issues.push({ field, message: 'El campo es obligatorio.' });
  if (length > maxLength) issues.push({ field, message: `El campo no puede superar ${maxLength} caracteres.` });
}

export function validateOfficeConfiguration(document: OfficeConfigurationDocument): OfficeConfigurationIssue[] {
  const issues: OfficeConfigurationIssue[] = [];
  validateText(issues, 'officeDisplayName', document.officeDisplayName, 100);

  // Documento persistido antes de la Fase 3: la clave simplemente no existe
  // — válido, nunca se trata como "objeto vacío" a rellenar.
  for (const [seatId, name] of Object.entries(document.coreSeatDisplayNames ?? {})) {
    if (!FIXED_AGENT_IDS.includes(seatId as FixedOfficeSeatId)) {
      issues.push({ field: `coreSeatDisplayNames.${seatId}`, message: 'Puesto fijo desconocido.' });
      continue;
    }
    if (typeof name === 'string') validateText(issues, `coreSeatDisplayNames.${seatId}`, name, CORE_SEAT_NAME_MAX_LENGTH);
  }

  for (const agentId of CONFIGURABLE_AGENT_IDS) {
    const specialist = document.specialists[agentId];
    const prefix = `specialists.${agentId}`;
    if (!specialist) {
      issues.push({ field: prefix, message: 'Falta la configuración del especialista.' });
      continue;
    }
    if (typeof specialist.enabled !== 'boolean') {
      issues.push({ field: `${prefix}.enabled`, message: 'El estado del especialista no es válido.' });
    }
    validateText(issues, `${prefix}.name`, specialist.name, 80);
    validateText(issues, `${prefix}.function`, specialist.function, 160);
    validateText(issues, `${prefix}.objective`, specialist.objective, 500);
    validateText(issues, `${prefix}.instructions`, specialist.instructions, 4000);
    if (specialist.clientLayer.length > 4000) {
      issues.push({ field: `${prefix}.clientLayer`, message: 'La personalización de cliente no puede superar 4000 caracteres.' });
    }
    // typeof-guarded, not `!== null` — every specialist persisted before this
    // field existed has `model` genuinely absent (undefined) in its stored
    // JSONB, not null; `undefined.length` would throw and take down the
    // whole projection (see office-agent-projection.ts), which is exactly
    // what silently emptied the live office's roster in production.
    if (typeof specialist.model === 'string' && specialist.model.length > 200) {
      issues.push({ field: `${prefix}.model`, message: 'El identificador del modelo no puede superar 200 caracteres.' });
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(specialist.color)) {
      issues.push({ field: `${prefix}.color`, message: 'El color debe ser un valor hexadecimal válido.' });
    }
    if (specialist.allowedActions.length === 0) {
      issues.push({ field: `${prefix}.allowedActions`, message: 'Selecciona al menos una acción.' });
    }
    if (new Set(specialist.allowedActions).size !== specialist.allowedActions.length) {
      issues.push({ field: `${prefix}.allowedActions`, message: 'No puede haber acciones duplicadas.' });
    }
    if (specialist.allowedActions.some((action) => !ACTION_SET.has(action))) {
      issues.push({ field: `${prefix}.allowedActions`, message: 'La configuración contiene una acción desconocida.' });
    }
    if (!APPROVAL_POLICY_SET.has(specialist.approvalPolicy)) {
      issues.push({ field: `${prefix}.approvalPolicy`, message: 'La política de aprobación no es válida.' });
    }
    if (new Set(specialist.extensions).size !== specialist.extensions.length) {
      issues.push({ field: `${prefix}.extensions`, message: 'No puede haber ampliaciones duplicadas.' });
    }
    if (new Set(specialist.skills).size !== specialist.skills.length) {
      issues.push({ field: `${prefix}.skills`, message: 'No puede haber habilidades duplicadas.' });
    }
  }

  return issues;
}

export function createOfficeConfigurationDocument(
  provisioned: WorkspaceOfficeConfiguration,
  actorId: string,
  occurredAt: string,
): OfficeConfigurationDocument {
  const specialists = Object.fromEntries(
    CONFIGURABLE_AGENT_IDS.map((agentId) => [agentId, defaultSpecialist(agentId)]),
  ) as OfficeConfigurationDocument['specialists'];

  return {
    workspaceId: provisioned.workspaceId,
    presetId: provisioned.presetId,
    presetVersion: provisioned.presetVersion,
    revision: 1,
    status: 'draft',
    officeDisplayName: provisioned.displayName,
    sectorId: null,
    specialists,
    coreSeatDisplayNames: {},
    updatedAt: occurredAt,
    updatedBy: actorId,
  };
}

function specialistResult(
  document: OfficeConfigurationDocument,
  agentId: OfficeSeatId,
): OfficeConfigurationMutationResult | OfficeSpecialistConfiguration {
  if (FIXED_AGENT_IDS.includes(agentId as (typeof FIXED_AGENT_IDS)[number])) {
    return { success: false, code: 'protected_seat' };
  }
  if (!CONFIGURABLE_AGENT_IDS.includes(agentId as ConfigurableOfficeAgentId)) {
    return { success: false, code: 'unknown_specialist' };
  }
  return document.specialists[agentId as ConfigurableOfficeAgentId];
}

export function applyOfficeConfigurationCommand(
  current: OfficeConfigurationDocument,
  command: OfficeConfigurationCommand,
): OfficeConfigurationMutationResult {
  if (command.actor.role !== 'onyxlink_super_admin') {
    return { success: false, code: 'unauthorized' };
  }
  if (command.workspaceId !== current.workspaceId) {
    return { success: false, code: 'workspace_mismatch' };
  }
  if (command.expectedRevision !== current.revision) {
    return { success: false, code: 'stale_revision' };
  }

  const next = cloneDocument(current);
  next.revision += 1;
  next.updatedAt = command.occurredAt;
  next.updatedBy = command.actor.actorId;
  let action: OfficeConfigurationHistoryAction;
  let sourceRevision: number | null = null;

  if (command.type === 'update_office') {
    next.officeDisplayName = command.displayName.trim();
    next.status = 'draft';
    action = 'office_updated';
  } else if (command.type === 'update_specialist') {
    const specialist = specialistResult(current, command.agentId);
    if ('success' in specialist) return specialist;
    const nextEnabled = command.patch.enabled ?? specialist.enabled;
    // A specialist can be fully configured without OpenRouter, but it can
    // never be SAVED as enabled without it — intellectual capacity (the
    // minimum to do any work at all) requires a real model connection.
    // Execution-tier tools (WhatsApp, HighLevel, Calendar, Airtable) are
    // deliberately NOT checked here: missing those never blocks activation,
    // only the specific actions that need them (see specialist-readiness.ts).
    if (nextEnabled && !command.openRouterConnected) {
      return { success: false, code: 'openrouter_not_connected' };
    }
    next.specialists[specialist.agentId] = {
      ...specialist,
      ...command.patch,
      agentId: specialist.agentId,
      name: command.patch.name?.trim() ?? specialist.name,
      function: command.patch.function?.trim() ?? specialist.function,
      objective: command.patch.objective?.trim() ?? specialist.objective,
      instructions: command.patch.instructions?.trim() ?? specialist.instructions,
      clientLayer: command.patch.clientLayer !== undefined ? command.patch.clientLayer.trim() : specialist.clientLayer,
      allowedActions: command.patch.allowedActions ? [...command.patch.allowedActions] : [...specialist.allowedActions],
      extensions: command.patch.extensions ? [...command.patch.extensions] : [...specialist.extensions],
      skills: command.patch.skills ? [...command.patch.skills] : [...specialist.skills],
    };
    next.status = 'draft';
    action = 'specialist_updated';
  } else if (command.type === 'reset_specialist') {
    const specialist = specialistResult(current, command.agentId);
    if ('success' in specialist) return specialist;
    next.specialists[specialist.agentId] = defaultSpecialist(specialist.agentId);
    next.status = 'draft';
    action = 'specialist_reset';
  } else if (command.type === 'update_core_seat_name') {
    if (!FIXED_AGENT_IDS.includes(command.agentId)) {
      return { success: false, code: 'unknown_specialist' };
    }
    const trimmed = command.name?.trim();
    if (trimmed) {
      next.coreSeatDisplayNames = { ...next.coreSeatDisplayNames, [command.agentId]: trimmed };
    } else {
      // name === null (o cadena vacía tras recortar espacios) borra el
      // override — nunca se guarda un nombre vacío, vuelve al fallback.
      const { [command.agentId]: _removed, ...rest } = next.coreSeatDisplayNames ?? {};
      next.coreSeatDisplayNames = rest;
    }
    next.status = 'draft';
    action = 'core_seat_name_updated';
  } else if (command.type === 'apply_vertical') {
    if (command.verticalId === null) {
      next.sectorId = null;
      next.status = 'draft';
      action = 'vertical_applied';
    } else {
      const appliedTemplateByAgent = Object.fromEntries(
        CONFIGURABLE_AGENT_IDS.map((id) => [id, current.specialists[id].templateId ?? undefined]),
      ) as Partial<Record<ConfigurableOfficeAgentId, SpecialistTemplateId>>;
      const clientPromptLayerByAgent = Object.fromEntries(
        CONFIGURABLE_AGENT_IDS.map((id) => [id, current.specialists[id].clientLayer]),
      ) as Partial<Record<ConfigurableOfficeAgentId, string>>;
      const plan = createVerticalApplicationPlan(command.verticalId, appliedTemplateByAgent, clientPromptLayerByAgent);
      if (!plan) return { success: false, code: 'unknown_vertical' };

      next.sectorId = command.verticalId;
      for (const change of plan.proposedChanges) {
        if (!change.willInstallTemplate) continue; // seat already occupied — overlay is resolved live, never persisted here
        const template = findSpecialistTemplate(change.templateId);
        if (!template) continue;
        const existing = next.specialists[change.agentId];
        next.specialists[change.agentId] = {
          ...existing,
          templateId: template.id,
          name: template.name,
          function: template.function,
          objective: template.objective,
          instructions: template.instructions,
          allowedActions: [...template.allowedActions],
          approvalPolicy: template.approvalPolicy,
          // enabled, color, clientLayer, extensions and skills are never touched by a sector apply.
        };
      }
      next.status = 'draft';
      action = 'vertical_applied';
    }
  } else if (command.type === 'publish') {
    next.status = 'published';
    action = 'published';
  } else {
    if (command.sourceDocument.workspaceId !== current.workspaceId || command.sourceDocument.revision !== command.revision) {
      return { success: false, code: 'revision_mismatch' };
    }
    sourceRevision = command.sourceDocument.revision;
    next.officeDisplayName = command.sourceDocument.officeDisplayName;
    next.sectorId = command.sourceDocument.sectorId;
    next.specialists = cloneDocument(command.sourceDocument).specialists;
    next.coreSeatDisplayNames = { ...command.sourceDocument.coreSeatDisplayNames };
    next.status = 'draft';
    action = 'revision_restored';
  }

  const issues = validateOfficeConfiguration(next);
  if (issues.length > 0) return { success: false, code: 'invalid_configuration', issues };

  return { success: true, document: next, action, sourceRevision };
}
