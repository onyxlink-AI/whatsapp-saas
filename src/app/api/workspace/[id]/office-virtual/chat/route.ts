import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireOfficeVirtualReader } from '@/features/office-virtual/server/office-virtual-access';
import {
  handleCoordinatorMessage,
  type AgendaPorts,
  type ContentPorts,
  type ContentWriteOutcome,
  type RealChatServicePorts,
} from '@/features/office-virtual/server/real-chat-service';
import type { OfficeConfigurationHead, OfficeConfigurationStore } from '@/features/office-virtual/server/office-configuration-service';
import type { OrchestratorStore } from '@/features/office-virtual/server/orchestrator-service';
import { resolveRealIntegrationStatuses } from '@/features/office-virtual/server/real-integration-status';
import { OPENROUTER_STATUS_ACTIVATES } from '@/features/office-virtual/client/central-integrations/real-integrations';
import type { WorkspaceOrchestratorBinding } from '@/features/office-virtual/client/central-orchestrator';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { getBusinessInfo, buildNowContext } from '@/features/inbox/services/business-info';
import { getGoogleCalendarConfig, createGoogleEvent, zonedDateTime } from '@/features/inbox/services/google-calendar-client';
import { getZoomConfig, createZoomMeeting } from '@/features/inbox/services/zoom-client';
import { readJsonBody } from '@/lib/auth/workspace-access';
import { searchContentItems, createContentItem } from '@/features/content/services/content-actions';
import { writeContentFieldsWithConfirmation } from '@/features/help-assistant/services/action-tools/content-tools';
import { createPendingConfirmationSlot } from '@/features/help-assistant/services/pending-actions';
import { logAudit } from '@/features/audit/services/audit-log';
import { resolveResponsibleMemberId, contentFieldsToPatch } from '@/features/office-virtual/server/office-content-mapping';
import { getWorkspaceOpenRouterCredential } from '@/features/content/services/openrouter-credential';
import type { GenerateChatReply } from '@/features/office-virtual/server/real-chat-service';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function configurationStore(): OfficeConfigurationStore {
  const client = serviceClient();
  return {
    async loadHead(workspaceId) {
      const { data, error } = await client
        .from('office_virtual_configurations')
        .select('preset_id, preset_version, revision, status, document, updated_at, updated_by_email')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        presetId: data.preset_id,
        presetVersion: data.preset_version,
        revision: data.revision,
        status: data.status,
        document: data.document as OfficeConfigurationHead['document'],
        updatedAt: data.updated_at,
        updatedBy: data.updated_by_email,
      };
    },
    // Read-only in practice for this route — loadOrProvisionOfficeConfiguration
    // only calls saveHead/appendRevision the first time a workspace ever
    // touches Oficina Virtual (provisioning a blank draft), which is an
    // acceptable side effect of opening the chat before ever visiting the
    // Configurador.
    async saveHead(workspaceId, head) {
      const { error } = await client.from('office_virtual_configurations').upsert(
        {
          workspace_id: workspaceId,
          preset_id: head.presetId,
          preset_version: head.presetVersion,
          revision: head.revision,
          status: head.status,
          document: head.document,
          updated_by: null,
          updated_by_email: head.updatedBy,
        },
        { onConflict: 'workspace_id' },
      );
      if (error) throw error;
    },
    async appendRevision(workspaceId, entry) {
      const { error } = await client.from('office_virtual_configuration_revisions').insert({
        workspace_id: workspaceId,
        revision: entry.revision,
        action: entry.action,
        actor_user_id: entry.actorUserId,
        actor_email: entry.actorEmail,
        source_revision: entry.sourceRevision,
        document: entry.document,
        occurred_at: entry.occurredAt,
      });
      if (error) throw error;
    },
    async loadRevisionDocument(workspaceId, revision) {
      const { data, error } = await client
        .from('office_virtual_configuration_revisions')
        .select('document')
        .eq('workspace_id', workspaceId)
        .eq('revision', revision)
        .maybeSingle();
      if (error) throw error;
      return data ? (data.document as OfficeConfigurationHead['document']) : null;
    },
  };
}

function orchestratorStore(): OrchestratorStore {
  const client = serviceClient();
  return {
    async loadBinding(workspaceId) {
      const { data, error } = await client
        .from('office_virtual_orchestrator')
        .select('active_mode, openrouter, hermes_telegram, custom_instructions, revision')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        workspaceId,
        activeMode: data.active_mode,
        openrouter: data.openrouter as WorkspaceOrchestratorBinding['openrouter'],
        hermesTelegram: data.hermes_telegram as WorkspaceOrchestratorBinding['hermesTelegram'],
        customInstructions: data.custom_instructions as string,
        revision: data.revision,
      };
    },
    async saveBinding() {
      // Never written from the chat path — it only ever reads the model policy.
    },
  };
}

/** "HH:MM" -> { hour, minute }. Assumes AGENDA_TASK_TAG's regex already validated the shape. */
function parseHourMinute(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(':').map(Number);
  return { hour, minute };
}

/** The business's own configured timezone (Ajustes → Negocio) — same source `resolveNowContext` uses, independent of whether any calendar integration is connected. */
async function resolveWorkspaceTimezone(workspaceId: string): Promise<string> {
  const info = await getBusinessInfo(workspaceId);
  return (info?.structured?.timezone as string | undefined) ?? 'America/Mexico_City';
}

function agendaPorts(): AgendaPorts {
  const client = serviceClient();
  return {
    async createTask(workspaceId, actorUserId, input) {
      const { data, error } = await client
        .from('agenda_tasks')
        .insert({
          workspace_id: workspaceId,
          title: input.title,
          notes: input.notes,
          scheduled_date: input.scheduledDate,
          start_time: input.startTime ? `${input.startTime}:00` : null,
          end_time: input.endTime ? `${input.endTime}:00` : null,
          created_by: actorUserId,
        })
        .select('id')
        .single();
      if (error) throw error;

      // Best-effort: neither Zoom nor Google Calendar hiccups (not connected,
      // transient API error) must ever fail the Agenda write itself — the
      // task above is already real and saved either way.
      if (!input.startTime) return { meetingLink: null };

      const { hour, minute } = parseHourMinute(input.startTime);
      const durationMinutes = input.endTime
        ? Math.max(5, (parseHourMinute(input.endTime).hour * 60 + parseHourMinute(input.endTime).minute) - (hour * 60 + minute))
        : 30;

      // Zoom first: a real join_url with no Workspace/domain-delegation
      // requirement, unlike Google Meet (see google-calendar-client.ts).
      let meetingLink: string | null = null;
      try {
        const zoomConfig = await getZoomConfig(workspaceId);
        if (zoomConfig) {
          const zoomTimezone = await resolveWorkspaceTimezone(workspaceId);
          const start = zonedDateTime(input.scheduledDate, hour, minute, zoomTimezone);
          const meeting = await createZoomMeeting({
            hostEmail: zoomConfig.hostEmail,
            topic: input.title,
            startIso: start.toISOString(),
            durationMinutes,
            timezone: zoomTimezone,
          });
          meetingLink = meeting.joinUrl;
        }
      } catch (zoomError) {
        console.error('[office-virtual/chat] Zoom sync failed', zoomError);
      }

      try {
        const config = await getGoogleCalendarConfig(workspaceId);
        if (!config) return { meetingLink };

        const start = zonedDateTime(input.scheduledDate, hour, minute, config.timezone);
        const description = [input.notes, meetingLink ? `Enlace: ${meetingLink}` : null]
          .filter((line): line is string => Boolean(line))
          .join('\n');

        const event = await createGoogleEvent({
          calendarId: config.calendarId,
          startIso: start.toISOString(),
          durationMinutes,
          summary: input.title,
          description: description || undefined,
          // Only ask Google for its own Meet link when Zoom didn't already provide one.
          requestMeetLink: !meetingLink,
        });

        meetingLink = meetingLink ?? event.meetLink ?? null;

        await client
          .from('agenda_tasks')
          .update({ google_event_id: event.id, meeting_link: meetingLink })
          .eq('id', data.id);

        return { meetingLink };
      } catch (calendarError) {
        console.error('[office-virtual/chat] Google Calendar sync failed', calendarError);
        if (meetingLink) {
          await client.from('agenda_tasks').update({ meeting_link: meetingLink }).eq('id', data.id);
        }
        return { meetingLink };
      }
    },
  };
}

async function resolveNowContext(workspaceId: string): Promise<string> {
  return buildNowContext(await resolveWorkspaceTimezone(workspaceId));
}

/**
 * Toda generación del Orquestador/especialistas usa EXCLUSIVAMENTE esta
 * implementación — nunca `generateChatReply`/`getOpenRouterApiKey` de
 * inbox/services/openrouter.ts, cuyo resolvedor cae silenciosamente a
 * `process.env.OPENROUTER_API_KEY` (la clave de plataforma) si la lectura
 * de la integración del workspace falla por cualquier motivo. Reutiliza el
 * MISMO resolvedor estricto/fail-closed que "Generar guion con IA"
 * (content-script-ai.ts) — una integración leída, un solo criterio de
 * "hay clave o no hay clave", nunca dos que puedan divergir.
 */
export const officeVirtualGenerateReply: GenerateChatReply = async ({ model, systemPrompt, messages, workspaceId, maxOutputTokens }) => {
  const credential = await getWorkspaceOpenRouterCredential(workspaceId);
  if (credential.status !== 'ready') {
    throw new Error(`[office-virtual/chat] OpenRouter no disponible para el workspace (${credential.status}) — nunca se usa la clave de plataforma como respaldo.`);
  }

  const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: credential.apiKey,
    headers: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'Oficina Virtual',
    },
  });

  const result = await generateText({
    model: openrouter.chat(model),
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    maxOutputTokens: maxOutputTokens ?? 700,
  });

  return { text: result.text };
};

export function contentPorts(): ContentPorts {
  function responsibleErrorMessage(code: 'responsible_not_found' | 'responsible_ambiguous' | 'database_error'): string {
    if (code === 'responsible_not_found') return 'La persona responsable no es un miembro activo de esta empresa.';
    if (code === 'responsible_ambiguous') return 'Hay varias personas con ese nombre. Indica un nombre inequívoco antes de guardar.';
    return 'No se pudo comprobar la persona responsable en este momento. Inténtalo de nuevo.';
  }

  return {
    async search(workspaceId, query) {
      const results = await searchContentItems(workspaceId, query);
      return results.map((r) => ({ id: r.id, title: r.title, status: r.status, version: r.version }));
    },

    async create(workspaceId, actorUserId, fields): Promise<ContentWriteOutcome> {
      // Independent re-check right before the real write — never reuse the
      // decision from the top of this same request. Same gate the route
      // itself enforces (session, membership activa, rol mínimo manager,
      // paquete Suite/office_virtual_enabled como kill switch) with fresh
      // reads, so a membership revocada o el kill switch apagado a mitad
      // de la petición sí bloquean la escritura.
      const reauth = await requireOfficeVirtualReader(workspaceId);
      if (!reauth.ok) return { kind: 'error', error: 'Ya no tienes acceso a la Oficina Virtual de esta empresa.' };

      let responsibleId: string | undefined;
      if (fields.responsible_name !== undefined) {
        const resolution = await resolveResponsibleMemberId(workspaceId, fields.responsible_name);
        if (!resolution.ok) return { kind: 'error', error: responsibleErrorMessage(resolution.code) };
        responsibleId = resolution.userId;
      }

      const created = await createContentItem(workspaceId, {
        title: fields.title?.trim() || 'Guion sin título',
        main_idea: fields.main_idea,
        description: fields.description,
        content_type: fields.content_type,
        platform: fields.platform,
        orientation: fields.orientation,
        duration_estimate: fields.duration_estimate,
        scheduled_date: fields.scheduled_date,
        script_hook: fields.script_hook,
        script_body: fields.script_body,
        script_closing: fields.script_closing,
        script_cta: fields.script_cta,
        bullet_points: fields.bullet_points,
        reference_links: fields.reference_links,
        lighting_notes: fields.lighting_notes,
        music_notes: fields.music_notes,
        notes: fields.notes,
        responsible_id: responsibleId,
      });
      if (!created.ok) return { kind: 'error', error: created.error };

      const contentItemId = created.data.id;

      void logAudit({
        workspaceId,
        actorUserId,
        action: 'office_virtual.create_content_draft',
        targetType: 'content_item',
        targetId: contentItemId,
        summary: `El especialista Creador de Contenido guardó el borrador "${fields.title?.trim() || 'Guion sin título'}"`,
      });

      return {
        kind: 'created',
        contentItemId,
        title: fields.title?.trim() || 'Guion sin título',
        status: 'idea',
        version: 1,
        href: `/contenido/${contentItemId}?from=scripts`,
      };
    },

    async update(workspaceId, actorUserId, contentItemId, expectedVersion, fields): Promise<ContentWriteOutcome> {
      const reauth = await requireOfficeVirtualReader(workspaceId);
      if (!reauth.ok) return { kind: 'error', error: 'Ya no tienes acceso a la Oficina Virtual de esta empresa.' };

      const patch = contentFieldsToPatch(fields);
      if (fields.responsible_name !== undefined) {
        const resolution = await resolveResponsibleMemberId(workspaceId, fields.responsible_name);
        if (!resolution.ok) return { kind: 'error', error: responsibleErrorMessage(resolution.code) };
        patch.responsible_id = resolution.userId;
      }
      if (Object.keys(patch).length === 0) {
        return { kind: 'error', error: 'No hay ningún campo que actualizar.' };
      }

      const outcome = await writeContentFieldsWithConfirmation(
        { workspaceId, actorUserId },
        createPendingConfirmationSlot(),
        contentItemId,
        expectedVersion,
        patch,
      );

      if (outcome.kind === 'error') return { kind: 'error', error: outcome.error };
      if (outcome.kind === 'requires_confirmation') {
        return { kind: 'requires_confirmation', token: outcome.token, expiresInSeconds: outcome.expiresInSeconds, summary: outcome.summary };
      }

      void logAudit({
        workspaceId,
        actorUserId,
        action: 'office_virtual.update_content_draft',
        targetType: 'content_item',
        targetId: contentItemId,
        summary: 'El especialista Creador de Contenido actualizó campos vacíos de un guion existente',
      });

      return { kind: 'updated', contentItemId, version: outcome.version };
    },
  };
}

function ports(): RealChatServicePorts {
  return {
    configuration: {
      store: configurationStore(),
      resolveOpenRouterConnected: async (workspaceId: string) => {
        const { openRouter } = await resolveRealIntegrationStatuses(workspaceId);
        return OPENROUTER_STATUS_ACTIVATES[openRouter];
      },
    },
    orchestrator: {
      store: orchestratorStore(),
      resolveRealOpenRouterStatus: async (workspaceId: string) => {
        const { openRouter } = await resolveRealIntegrationStatuses(workspaceId);
        return openRouter;
      },
    },
    generateReply: officeVirtualGenerateReply,
    agenda: agendaPorts(),
    content: contentPorts(),
    resolveNowContext,
  };
}

const ChatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(4000),
});

const BodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(ChatTurnSchema).max(30).default([]),
});

const ERROR_MESSAGE: Record<'model_missing' | 'api_key_missing', string> = {
  model_missing: 'El Orquestador todavía no tiene un modelo asignado — configúralo en Orquestador → Modelos de especialistas.',
  api_key_missing: 'OpenRouter no está conectado — conéctalo en Orquestador → Conexión principal.',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireOfficeVirtualReader(workspaceId);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = BodySchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mensaje no válido' }, { status: 400 });
  }

  try {
    const result = await handleCoordinatorMessage(workspaceId, parsed.data.history, parsed.data.message, auth.userId, ports());
    if (!result.success) {
      return NextResponse.json({ error: ERROR_MESSAGE[result.code] }, { status: 409 });
    }
    return NextResponse.json({
      coordinatorText: result.coordinatorText,
      delegation: result.delegation,
    });
  } catch (error) {
    console.error('[POST office-virtual/chat]', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
