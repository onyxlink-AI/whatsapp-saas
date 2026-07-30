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
const AGENDA_TASK_TAG = /<agenda_task\s+title="([^"]*)"\s+date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/agenda_task>/i;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type GenerateChatReply = (params: {
  model: string;
  systemPrompt: string;
  messages: ChatTurn[];
  workspaceId: string;
  maxOutputTokens?: number;
}) => Promise<{ text: string }>;

export type AgendaTaskInput = { title: string; notes: string | null; scheduledDate: string };

export type AgendaPorts = {
  /** Real INSERT into `agenda_tasks` — the whole reason this tag isn't just text. */
  createTask: (workspaceId: string, actorUserId: string | null, input: AgendaTaskInput) => Promise<void>;
};

export type RealChatServicePorts = {
  configuration: OfficeConfigurationServicePorts;
  orchestrator: OrchestratorServicePorts;
  generateReply: GenerateChatReply;
  agenda: AgendaPorts;
  /** Ready-to-inject "## Fecha actual" block, resolved from the workspace's configured timezone — see business-info.ts's buildNowContext. */
  resolveNowContext: (workspaceId: string) => Promise<string>;
};

type ActiveSpecialist = { agentId: ConfigurableOfficeAgentId; name: string; function: string; objective: string };

function canManageAgenda(specialist: OfficeConfigurationDocument['specialists'][ConfigurableOfficeAgentId]): boolean {
  return specialist.allowedActions.includes('create_task') || specialist.allowedActions.includes('schedule_call');
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
  ].join('\n');
}

function specialistSystemPrompt(
  officeDisplayName: string,
  specialist: OfficeConfigurationDocument['specialists'][ConfigurableOfficeAgentId],
  nowContext: string,
): string {
  const agendaTool = canManageAgenda(specialist)
    ? [
        'Herramienta real de Agenda: cuando el título y la fecha de una cita, llamada o tarea queden confirmados con el usuario, termina tu respuesta con exactamente un bloque en esta forma exacta — esto SÍ se guarda de verdad en la Agenda del negocio, no es solo una frase de cortesía:',
        '<agenda_task title="título breve" date="YYYY-MM-DD">notas opcionales (con quién es, detalles acordados)</agenda_task>',
        'Usa la fecha de hoy de arriba para calcular la fecha exacta cuando te den una relativa ("mañana", "el viernes que viene", etc.) — nunca preguntes el año si ya lo puedes deducir. No incluyas este bloque si todavía falta el título o la fecha exacta, o si el usuario no ha confirmado: en ese caso sigue preguntando en tu texto normal.',
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
            agendaTask: { title: string; scheduledDate: string } | null;
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

  const specialistReply = await ports.generateReply({
    model,
    systemPrompt: specialistSystemPrompt(head.document.officeDisplayName, targetConfig, nowContext),
    messages: [{ role: 'user', content: task }],
    workspaceId,
    maxOutputTokens: 700,
  });

  const agendaMatch = specialistReply.text.match(AGENDA_TASK_TAG);
  const visibleSpecialistText = specialistReply.text.replace(AGENDA_TASK_TAG, '').trim();
  let agendaTask: { title: string; scheduledDate: string } | null = null;

  // Defense in depth: only ever act on the tag when THIS specialist's own
  // configured allowedActions actually grant it — never trust the model's
  // own claim, even though a specialist without the capability was never
  // told the tag exists in the first place.
  if (agendaMatch && canManageAgenda(targetConfig)) {
    const title = agendaMatch[1].trim();
    const scheduledDate = agendaMatch[2];
    const notes = agendaMatch[3].trim() || null;
    if (title) {
      await ports.agenda.createTask(workspaceId, actorUserId, { title, notes, scheduledDate });
      agendaTask = { title, scheduledDate };
    }
  }

  return {
    success: true,
    coordinatorText: visibleCoordinatorText,
    delegation: { agentId: targetId, specialistName: targetSpecialist.name, text: visibleSpecialistText, agendaTask },
  };
}
