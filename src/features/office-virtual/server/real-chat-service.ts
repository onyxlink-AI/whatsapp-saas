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
// This is intellectual work only — analysis, drafting, delegation — never a
// real external action (send a WhatsApp message, write to a CRM, etc.).
// These specialists have no real tool wiring yet, so there is nothing here
// that needs an approval queue; see CHECKLIST-MAESTRO for the later phase
// that adds real tool execution.

const DELEGATE_TAG = /<delegate\s+agent="([a-z0-9-]+)">([\s\S]*?)<\/delegate>/i;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type GenerateChatReply = (params: {
  model: string;
  systemPrompt: string;
  messages: ChatTurn[];
  workspaceId: string;
  maxOutputTokens?: number;
}) => Promise<{ text: string }>;

export type RealChatServicePorts = {
  configuration: OfficeConfigurationServicePorts;
  orchestrator: OrchestratorServicePorts;
  generateReply: GenerateChatReply;
};

type ActiveSpecialist = { agentId: ConfigurableOfficeAgentId; name: string; function: string; objective: string };

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

function coordinatorSystemPrompt(officeDisplayName: string, specialists: ActiveSpecialist[]): string {
  const roster = specialists.length > 0
    ? specialists.map((s) => `- ${s.name} (id "${s.agentId}"): ${s.function} — ${s.objective}`).join('\n')
    : '(Ningún especialista está activado todavía — no delegues, responde tú mismo y sugiere activar uno en el Configurador si la tarea lo requiere.)';

  return [
    `Eres el Orquestador (Coordinador) de "${officeDisplayName}", una oficina virtual de especialistas de IA.`,
    'Hablas directamente con el dueño/administrador del negocio. Tu trabajo es entender lo que pide, y si la tarea encaja con uno de tus especialistas, delegársela — nunca hacer tú el trabajo de un especialista que sí está disponible.',
    '',
    'Especialistas disponibles ahora mismo:',
    roster,
    '',
    'Cuando decidas delegar una tarea a un especialista disponible, termina tu respuesta con exactamente un bloque en esta forma exacta (una sola vez, el último elemento de tu respuesta):',
    '<delegate agent="ID_DEL_ESPECIALISTA">instrucciones claras y completas de la tarea para ese especialista</delegate>',
    'El texto de tu respuesta ANTES de ese bloque es lo único que ve el usuario de tu parte — escribe ahí algo breve confirmando a quién le estás pasando la tarea. No inventes especialistas que no estén en la lista de arriba. Si ningún especialista encaja, no incluyas el bloque y responde tú directamente.',
  ].join('\n');
}

function specialistSystemPrompt(officeDisplayName: string, specialist: OfficeConfigurationDocument['specialists'][ConfigurableOfficeAgentId]): string {
  return [
    `Eres ${specialist.name}, especialista en "${specialist.function}" dentro de "${officeDisplayName}".`,
    `Objetivo: ${specialist.objective}`,
    '',
    'Instrucciones de trabajo:',
    specialist.instructions,
    ...(specialist.clientLayer.trim() ? ['', 'Notas adicionales del negocio:', specialist.clientLayer] : []),
    '',
    'Te acaba de llegar una tarea delegada por el Orquestador. Responde directamente con el resultado de tu trabajo (el análisis, el borrador, la recomendación) — nunca digas que "vas a hacerlo", entrégalo ya en tu respuesta.',
  ].join('\n');
}

export type RealChatResult =
  | {
      success: true;
      coordinatorText: string;
      delegation: { agentId: ConfigurableOfficeAgentId; specialistName: string; text: string } | null;
    }
  | { success: false; code: 'model_missing' | 'api_key_missing' };

export async function handleCoordinatorMessage(
  workspaceId: string,
  history: ChatTurn[],
  message: string,
  ports: RealChatServicePorts,
): Promise<RealChatResult> {
  const [head, binding] = await Promise.all([
    loadOrProvisionOfficeConfiguration(
      workspaceId,
      { actorId: 'office-chat', role: 'workspace_admin', workspaceId },
      ports.configuration,
    ),
    loadOrchestratorBinding(workspaceId, ports.orchestrator),
  ]);

  if (!binding.openrouter.hasApiKey) return { success: false, code: 'api_key_missing' };

  const model = binding.openrouter.model ?? binding.openrouter.fallbackModel;
  if (!model) return { success: false, code: 'model_missing' };

  const specialists = listActiveSpecialists(head.document);
  const systemPrompt = coordinatorSystemPrompt(head.document.officeDisplayName, specialists);

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
    systemPrompt: specialistSystemPrompt(head.document.officeDisplayName, targetConfig),
    messages: [{ role: 'user', content: task }],
    workspaceId,
    maxOutputTokens: 700,
  });

  return {
    success: true,
    coordinatorText: visibleCoordinatorText,
    delegation: { agentId: targetId, specialistName: targetSpecialist.name, text: specialistReply.text },
  };
}
