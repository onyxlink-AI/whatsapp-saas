import { loadOrProvisionOfficeConfiguration, type OfficeConfigurationServicePorts } from './office-configuration-service';
import { loadOrchestratorBinding, type OrchestratorServicePorts } from './orchestrator-service';
import { projectPublishedOfficeAgents } from '../client/central-integrations/office-agent-projection';
import type { ConfigurableOfficeAgentId } from '../client/central-integrations/specialist-seats';
import type { OfficeConfigurationDocument } from '../client/central-integrations/configuration';

// Real (non-demo) chat with the Orquestador. Scope, deliberately: the
// Coordinador is the only agent wired to a real OpenRouter call in this
// first pass — it's the one stable identity shared by both the model-policy
// system (AgentId 'coordinator') and the chat UI (ChatPanel/useAgentChat),
// and the one the client actually asked to talk to. When it decides a
// published specialist should take a task, it emits a single
// `<delegate agent="specialist-N">task</delegate>` tag in its raw reply;
// this service parses that tag, makes a SECOND real call using that
// specialist's real published name/function/objective/instructions, and
// returns both replies so the client sees one continuous conversation.
//
// This is intellectual work only — analysis, drafting, delegation — with one
// real external action: a specialist whose `allowedActions` include
// 'create_task' or 'schedule_call' can emit an `<agenda_task>` tag to
// actually persist an appointment/task in the real `agenda_tasks` table (see
// CHECKLIST-MAESTRO for the broader real-tool-execution phase this is a
// first, narrow slice of). Gated server-side by the specialist's own
// configured allowedActions — never by trusting the model's own claim.

const DELEGATE_TAG = /<delegate\s+agent="([a-z0-9-]+)">([\s\S]*?)<\/delegate>/i;
const AGENDA_TASK_TAG =
  /<agenda_task\s+title="([^"]*)"\s+date="(\d{4}-\d{2}-\d{2})"(?:\s+start="(\d{2}:\d{2})")?(?:\s+end="(\d{2}:\d{2})")?>([\s\S]*?)<\/agenda_task>/i;
// Creador de Contenido — dos formas, nunca ambas a la vez (el prompt del
// especialista deja claro cuál usar). El cuerpo es JSON (a diferencia de
// <agenda_task>) porque un guion tiene demasiados campos estructurados para
// caber en atributos legibles; se parsea con try/catch y se valida contra
// los mismos schemas Zod que ya usa el Asistente de Ayuda (nunca a ciegas).
const CONTENT_DRAFT_TAG = /<content_draft>([\s\S]*?)<\/content_draft>/i;
const CONTENT_UPDATE_TAG =
  /<content_update\s+content_item_id="([0-9a-fA-F-]{36})"\s+expected_version="(\d+)">([\s\S]*?)<\/content_update>/i;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type GenerateChatReply = (params: {
  model: string;
  systemPrompt: string;
  messages: ChatTurn[];
  workspaceId: string;
  maxOutputTokens?: number;
}) => Promise<{ text: string }>;

export type AgendaTaskInput = {
  title: string;
  notes: string | null;
  scheduledDate: string;
  /** "HH:MM", 24h, in the workspace's configured timezone — null when the item has no specific time. */
  startTime: string | null;
  endTime: string | null;
};

export type AgendaPorts = {
  /** Real INSERT into `agenda_tasks` — the whole reason this tag isn't just text. Returns the Google Meet link when one was generated (timed appointment + Calendar connected), else null. */
  createTask: (
    workspaceId: string,
    actorUserId: string | null,
    input: AgendaTaskInput,
  ) => Promise<{ meetingLink: string | null }>;
};

export type ContentSearchResult = { id: string; title: string; status: string; version: number };

/**
 * Free-form fields the specialist can propose — key names match
 * `ContentItemPatch` 1:1 (content-actions.ts) on purpose, zero translation
 * layer. `responsible_name` is the ONLY responsible-person field the model
 * ever sees: it never gets to invent a raw membership UUID, so an external/
 * made-up name simply fails to resolve server-side (see office-content-ports.ts)
 * instead of ever reaching the database as a foreign id.
 */
export type ContentDraftFields = {
  title?: string;
  main_idea?: string;
  description?: string;
  content_type?: string;
  platform?: string;
  orientation?: 'vertical' | 'horizontal';
  duration_estimate?: string;
  scheduled_date?: string;
  responsible_name?: string;
  script_hook?: string;
  script_body?: string;
  script_closing?: string;
  script_cta?: string;
  bullet_points?: string[];
  reference_links?: { label: string; url: string }[];
  lighting_notes?: string;
  music_notes?: string;
  notes?: string;
};

export type ContentWriteOutcome =
  | { kind: 'created'; contentItemId: string; title: string; status: string; version: number; href: string }
  | { kind: 'updated'; contentItemId: string; version: number }
  | { kind: 'requires_confirmation'; token: string; expiresInSeconds: number; summary: string }
  | { kind: 'error'; error: string };

export type ContentPorts = {
  /** search_content real, workspace-scoped — mismo camino que usa el Asistente de Ayuda. */
  search: (workspaceId: string, query: string) => Promise<ContentSearchResult[]>;
  /** Creación directa (fila nueva, nunca sustituye nada) — siempre en estado 'idea'/borrador. */
  create: (workspaceId: string, actorUserId: string, fields: ContentDraftFields) => Promise<ContentWriteOutcome>;
  /** Relleno directo de campos vacíos + confirmación de dos pasos para sustituir campos con contenido — reutiliza writeContentFieldsWithConfirmation tal cual. */
  update: (
    workspaceId: string,
    actorUserId: string,
    contentItemId: string,
    expectedVersion: number,
    fields: ContentDraftFields,
  ) => Promise<ContentWriteOutcome>;
};

export type RealChatServicePorts = {
  configuration: OfficeConfigurationServicePorts;
  orchestrator: OrchestratorServicePorts;
  generateReply: GenerateChatReply;
  agenda: AgendaPorts;
  content: ContentPorts;
  /** Ready-to-inject "## Fecha actual" block, resolved from the workspace's configured timezone — see business-info.ts's buildNowContext. */
  resolveNowContext: (workspaceId: string) => Promise<string>;
};

type ActiveSpecialist = { agentId: ConfigurableOfficeAgentId; name: string; function: string; objective: string };

function canManageAgenda(specialist: OfficeConfigurationDocument['specialists'][ConfigurableOfficeAgentId]): boolean {
  return specialist.allowedActions.includes('create_task') || specialist.allowedActions.includes('schedule_call');
}

// Defense in depth, same shape as canManageAgenda: gated EXCLUSIVELY on this
// specialist's own persisted/published allowedActions — never on its
// templateId, its visible name, or anything the model itself claims. Today
// only the 'creador-contenido' template ships these actions
// (specialist-templates.ts), but the check itself is template-agnostic on
// purpose — a future template could be granted the same actions without
// touching this file.
function canReadContent(specialist: OfficeConfigurationDocument['specialists'][ConfigurableOfficeAgentId]): boolean {
  return specialist.allowedActions.includes('read_content');
}
function canCreateContentDraft(specialist: OfficeConfigurationDocument['specialists'][ConfigurableOfficeAgentId]): boolean {
  return specialist.allowedActions.includes('create_content_draft');
}
function canUpdateContentDraft(specialist: OfficeConfigurationDocument['specialists'][ConfigurableOfficeAgentId]): boolean {
  return specialist.allowedActions.includes('update_content_draft');
}

function listActiveSpecialists(document: OfficeConfigurationDocument): ActiveSpecialist[] {
  const projection = projectPublishedOfficeAgents(document, document.workspaceId);
  if (!projection.success) return [];
  return projection.projection.seats.map((seat) => ({
    agentId: seat.agentId,
    name: seat.name,
    function: seat.function,
    objective: seat.objective,
  }));
}

function coordinatorSystemPrompt(
  officeDisplayName: string,
  specialists: ActiveSpecialist[],
  nowContext: string,
  customInstructions: string,
): string {
  const roster = specialists.length > 0
    ? specialists.map((s) => `- ${s.name} (id "${s.agentId}"): ${s.function} — ${s.objective}`).join('\n')
    : '(Ningún especialista está activado todavía — no delegues, responde tú mismo y sugiere activar uno en el Configurador si la tarea lo requiere.)';

  return [
    `Eres el Orquestador (Coordinador) de "${officeDisplayName}", una oficina virtual de especialistas de IA.`,
    'Hablas directamente con el dueño/administrador del negocio. Tu trabajo es entender lo que pide, y si la tarea encaja con uno de tus especialistas, delegársela — nunca hacer tú el trabajo de un especialista que sí está disponible.',
    '',
    nowContext,
    '',
    'Especialistas disponibles ahora mismo:',
    roster,
    ...(customInstructions.trim() ? ['', 'Instrucciones personalizadas de tu dueño — síguelas siempre, tienen prioridad sobre tu criterio por defecto:', customInstructions.trim()] : []),
    '',
    'Cuando decidas delegar una tarea a un especialista disponible, termina tu respuesta con exactamente un bloque en esta forma exacta (una sola vez, el último elemento de tu respuesta):',
    '<delegate agent="ID_DEL_ESPECIALISTA">instrucciones claras y completas de la tarea para ese especialista</delegate>',
    'El texto de tu respuesta ANTES de ese bloque es lo único que ve el usuario de tu parte — escribe ahí algo breve confirmando a quién le estás pasando la tarea. No inventes especialistas que no estén en la lista de arriba. Si ningún especialista encaja, no incluyas el bloque y responde tú directamente.',
    'Importante sobre "pedir aprobación antes de acciones sensibles": eso aplica a enviar mensajes externos, publicar, pagos, borrar datos o cambiar permisos — NUNCA a agendar una cita o tarea nueva que el dueño ya te pidió explícitamente en su mensaje. Si el dueño ya dijo con quién y cuándo, eso YA es su confirmación: delega el dato completo y deja que el especialista la cree directamente, no le pidas al especialista que solo "prepare un borrador" ni que "espere confirmación" — eso genera fricción innecesaria que el dueño no quiere.',
  ].join('\n');
}

function contentToolPrompt(
  specialist: OfficeConfigurationDocument['specialists'][ConfigurableOfficeAgentId],
  searchResults: ContentSearchResult[],
): string {
  const canCreate = canCreateContentDraft(specialist);
  const canUpdate = canUpdateContentDraft(specialist);
  if (!canCreate && !canUpdate) return '';

  const lines: string[] = [];

  if (canCreate) {
    lines.push(
      'Herramienta real para GUARDAR un guion NUEVO como borrador: termina tu respuesta con exactamente un bloque en esta forma exacta — esto SÍ crea de verdad una fila nueva en Contenido → Guiones (siempre en estado borrador/idea, nunca publicado):',
      '<content_draft>{"title":"...","main_idea":"...","description":"...","content_type":"...","platform":"...","orientation":"vertical|horizontal","duration_estimate":"...","scheduled_date":"YYYY-MM-DD","responsible_name":"...","script_hook":"...","script_body":"...","script_closing":"...","script_cta":"...","bullet_points":["..."],"reference_links":[{"label":"...","url":"..."}],"lighting_notes":"...","music_notes":"...","notes":"..."}</content_draft>',
      'El JSON dentro del bloque debe ser JSON válido de una sola línea. Omite cualquier clave que no tengas — nunca inventes datos que el dueño no te dio. "title" es el único campo casi siempre necesario; si de verdad no tienes ni idea de título, usa uno breve derivado de la idea principal.',
      'responsible_name es el NOMBRE de la persona responsable tal como te lo dijeron (nunca un ID). Inclúyelo solo cuando el dueño haya indicado una persona concreta: si no coincide de forma inequívoca con un miembro activo de esta empresa, el sistema rechazará el guardado completo.',
      'Usa esto SOLO cuando el dueño te pida crear/guardar un guion nuevo — nunca para sustituir uno que ya existe (para eso está la herramienta de actualizar, si la tienes).',
    );
  }

  if (canUpdate) {
    if (searchResults.length > 0) {
      const catalog = searchResults
        .map((r) => `- content_item_id="${r.id}" expected_version="${r.version}" — "${r.title}" (estado: ${r.status})`)
        .join('\n');
      lines.push(
        '',
        'Guiones existentes que podrían coincidir con lo que te pidieron (búsqueda automática sobre la tarea delegada):',
        catalog,
        'Herramienta real para ACTUALIZAR uno de esos guiones: termina tu respuesta con exactamente un bloque en esta forma exacta, copiando content_item_id y expected_version TAL CUAL de la lista de arriba — nunca los inventes ni los recuerdes de un turno anterior:',
        '<content_update content_item_id="UUID_DE_ARRIBA" expected_version="N">{"script_hook":"...","script_body":"..."}</content_update>',
        'El JSON dentro del bloque lleva SOLO los campos que quieres cambiar (mismas claves que content_draft). Si un campo ya tenía contenido, el sistema pedirá confirmación al dueño antes de sustituirlo — nunca lo des por hecho ni digas "ya está actualizado" hasta que el sistema confirme que se guardó de verdad.',
      );
    } else {
      lines.push(
        '',
        'No encontré ningún guion existente que coincida con esta tarea — si el dueño quiere actualizar uno en concreto, pídele el título exacto o créalo como borrador nuevo si lo que quiere es empezar uno.',
      );
    }
  }

  return lines.join('\n');
}

function specialistSystemPrompt(
  officeDisplayName: string,
  specialist: OfficeConfigurationDocument['specialists'][ConfigurableOfficeAgentId],
  nowContext: string,
  contentSearchResults: ContentSearchResult[],
): string {
  const contentTool = contentToolPrompt(specialist, contentSearchResults);
  const agendaTool = canManageAgenda(specialist)
    ? [
        'Herramienta real de Agenda: cuando tengas un título y una fecha, termina tu respuesta con exactamente un bloque en esta forma exacta — esto SÍ se guarda de verdad en la Agenda del negocio (y en Google Calendar si está conectado), no es solo una frase de cortesía:',
        '<agenda_task title="título breve" date="YYYY-MM-DD" start="HH:MM" end="HH:MM">una frase corta y clara para un humano</agenda_task>',
        'ÚNICO requisito real para crearla: título + fecha (la hora es opcional). Eso es todo lo que necesita esta herramienta.',
        'Si el mensaje que te llegó ya dice claramente con quién y cuándo (aunque sea "mañana", "el lunes que viene", etc.), eso YA es la confirmación del dueño — crea la cita en esta misma respuesta, con ese bloque. NUNCA describas un "borrador pendiente de aprobación" ni digas que necesitas confirmación extra: si te delegaron la tarea con esos datos, es porque el dueño ya la confirmó.',
        'NUNCA pidas duración, modalidad (presencial/videollamada), enlace de reunión, email o teléfono del invitado, ni recordatorios — esta herramienta no los usa ni los necesita. Pedir eso es la razón por la que antes esto no funcionaba: solo pregunta si de verdad falta el título o el día.',
        'Usa la fecha de hoy de arriba para calcular la fecha exacta cuando te den una relativa — nunca preguntes el año si ya lo puedes deducir.',
        'Los atributos start/end son opcionales (formato 24h, hora del negocio) — inclúyelos solo si te dieron una hora concreta, y omítelos por completo si no.',
        'El título va SOLO el nombre corto de la cita/tarea (ej. "Reunión con Antonio Fernández") — nunca metas fechas, horas ni datos técnicos ahí.',
        'Las notas son UNA frase breve para que un humano las lea de un vistazo (ej. "Cliente interesado en revisar el Toyota Corolla, prefiere WhatsApp"). Nunca escribas ahí fechas/horas en formato técnico (ISO, con T, con offset como +02:00) — ya van en date/start/end. Nunca escribas ahí instrucciones sobre cómo debes comportarte tú (esas las sigues en silencio, no se las cuentas al dueño).',
        'Solo sigue preguntando en tu texto normal (sin el bloque) si de verdad falta el título o un día identificable — nunca por los detalles que la lista de arriba dice que no pidas.',
      ].join('\n')
    : '';

  return [
    `Eres ${specialist.name}, especialista en "${specialist.function}" dentro de "${officeDisplayName}".`,
    `Objetivo: ${specialist.objective}`,
    '',
    nowContext,
    '',
    'Instrucciones de trabajo:',
    specialist.instructions,
    ...(specialist.clientLayer.trim() ? ['', 'Notas adicionales del negocio:', specialist.clientLayer] : []),
    ...(agendaTool ? ['', agendaTool] : []),
    ...(contentTool ? ['', contentTool] : []),
    '',
    'Te acaba de llegar una tarea delegada por el Orquestador. Responde directamente con el resultado de tu trabajo (el análisis, el borrador, la recomendación) — nunca digas que "vas a hacerlo", entrégalo ya en tu respuesta.',
  ].join('\n');
}

export type RealChatResult =
  | {
      success: true;
      coordinatorText: string;
      delegation:
        | {
            agentId: ConfigurableOfficeAgentId;
            specialistName: string;
            text: string;
            /** Non-null only when the specialist's confirmed tag was actually written to `agenda_tasks`. */
            agendaTask:
              | { title: string; scheduledDate: string; startTime: string | null; endTime: string | null; meetingLink: string | null }
              | null;
            /** Non-null only when the specialist emitted a content tag AND its own allowedActions grant it — real DB outcome, never inferred from the model's text. */
            content: ContentWriteOutcome | null;
          }
        | null;
    }
  | { success: false; code: 'model_missing' | 'api_key_missing' };

export async function handleCoordinatorMessage(
  workspaceId: string,
  history: ChatTurn[],
  message: string,
  actorUserId: string | null,
  ports: RealChatServicePorts,
): Promise<RealChatResult> {
  const [head, binding, nowContext] = await Promise.all([
    loadOrProvisionOfficeConfiguration(
      workspaceId,
      { actorId: 'office-chat', role: 'workspace_admin', workspaceId },
      ports.configuration,
    ),
    loadOrchestratorBinding(workspaceId, ports.orchestrator),
    ports.resolveNowContext(workspaceId),
  ]);

  if (!binding.openrouter.hasApiKey) return { success: false, code: 'api_key_missing' };

  const model = binding.openrouter.model ?? binding.openrouter.fallbackModel;
  if (!model) return { success: false, code: 'model_missing' };

  const specialists = listActiveSpecialists(head.document);
  const systemPrompt = coordinatorSystemPrompt(head.document.officeDisplayName, specialists, nowContext, binding.customInstructions);

  const coordinatorReply = await ports.generateReply({
    model,
    systemPrompt,
    messages: [...history, { role: 'user', content: message }],
    workspaceId,
    maxOutputTokens: 700,
  });

  const match = coordinatorReply.text.match(DELEGATE_TAG);
  const visibleCoordinatorText = coordinatorReply.text.replace(DELEGATE_TAG, '').trim();

  if (!match) {
    return { success: true, coordinatorText: visibleCoordinatorText, delegation: null };
  }

  const targetId = match[1] as ConfigurableOfficeAgentId;
  const task = match[2].trim();
  const targetSpecialist = specialists.find((s) => s.agentId === targetId);
  const targetConfig = head.document.specialists[targetId];

  // The model hallucinated an id that isn't actually active — surface only
  // the coordinator's own text rather than crash or silently drop the task.
  if (!targetSpecialist || !targetConfig) {
    return { success: true, coordinatorText: visibleCoordinatorText, delegation: null };
  }

  // Búsqueda real ANTES de generar la respuesta del especialista — nunca al
  // revés. Esta arquitectura es de un único turno por mensaje (sin bucle de
  // tool-calling), así que el candidato a actualizar se resuelve aquí, en
  // el servidor, con una consulta real — el modelo nunca inventa un
  // content_item_id ni una versión, solo copia lo que ya le dimos.
  const contentSearchResults = canReadContent(targetConfig) ? await ports.content.search(workspaceId, task) : [];

  const specialistReply = await ports.generateReply({
    // The specialist's own model (set directly on its card in the
    // Configurador) takes priority over the workspace default — this is the
    // only place that choice actually reaches a real OpenRouter call.
    model: targetConfig.model ?? model,
    systemPrompt: specialistSystemPrompt(head.document.officeDisplayName, targetConfig, nowContext, contentSearchResults),
    messages: [{ role: 'user', content: task }],
    workspaceId,
    maxOutputTokens: 900,
  });

  const agendaMatch = specialistReply.text.match(AGENDA_TASK_TAG);
  let agendaTask:
    | { title: string; scheduledDate: string; startTime: string | null; endTime: string | null; meetingLink: string | null }
    | null = null;

  // Defense in depth: only ever act on the tag when THIS specialist's own
  // configured allowedActions actually grant it — never trust the model's
  // own claim, even though a specialist without the capability was never
  // told the tag exists in the first place.
  if (agendaMatch && canManageAgenda(targetConfig)) {
    const title = agendaMatch[1].trim();
    const scheduledDate = agendaMatch[2];
    const startTime = agendaMatch[3] ?? null;
    const endTime = agendaMatch[4] ?? null;
    const notes = agendaMatch[5].trim() || null;
    if (title) {
      const { meetingLink } = await ports.agenda.createTask(workspaceId, actorUserId, { title, notes, scheduledDate, startTime, endTime });
      agendaTask = { title, scheduledDate, startTime, endTime, meetingLink };
    }
  }

  const draftMatch = specialistReply.text.match(CONTENT_DRAFT_TAG);
  const updateMatch = specialistReply.text.match(CONTENT_UPDATE_TAG);
  let content: ContentWriteOutcome | null = null;

  // Same defense-in-depth as agenda above — gated on targetConfig's own
  // persisted allowedActions, never on the model's claim, and never on
  // templateId/name. actorUserId is only ever null in theory (the route
  // always passes a real authenticated user id) — content writes need a
  // real actor to attribute the change to, so this simply no-ops instead
  // of writing with a fabricated identity.
  if (actorUserId) {
    if (draftMatch && canCreateContentDraft(targetConfig)) {
      const parsedFields = parseContentTagJson(draftMatch[1]);
      if (parsedFields) {
        content = await ports.content.create(workspaceId, actorUserId, parsedFields);
      }
    } else if (updateMatch && canUpdateContentDraft(targetConfig)) {
      const contentItemId = updateMatch[1];
      const expectedVersion = Number(updateMatch[2]);
      const parsedFields = parseContentTagJson(updateMatch[3]);
      if (parsedFields) {
        content = await ports.content.update(workspaceId, actorUserId, contentItemId, expectedVersion, parsedFields);
      }
    }
  }

  const visibleSpecialistText = specialistReply.text
    .replace(AGENDA_TASK_TAG, '')
    .replace(CONTENT_DRAFT_TAG, '')
    .replace(CONTENT_UPDATE_TAG, '')
    .trim();

  return {
    success: true,
    coordinatorText: visibleCoordinatorText,
    delegation: { agentId: targetId, specialistName: targetSpecialist.name, text: visibleSpecialistText, agendaTask, content },
  };
}

/**
 * `<content_draft>`/`<content_update>`'s body is JSON, unlike every other
 * tag in this file — a model can emit malformed JSON (truncated output,
 * stray text). Never throw, never crash the request: an unparsable body is
 * treated exactly like "no tag matched", same as a hallucinated specialist
 * id above. Shape validation beyond "is a JSON object" happens downstream,
 * in the real Zod schemas content-actions.ts/content-tools.ts already use
 * — never duplicated here.
 */
function parseContentTagJson(raw: string): ContentDraftFields | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as ContentDraftFields;
  } catch {
    return null;
  }
}
