import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireOfficeVirtualReader } from '@/features/office-virtual/server/office-virtual-access';
import {
  handleCoordinatorMessage,
  type AgendaPorts,
  type RealChatServicePorts,
} from '@/features/office-virtual/server/real-chat-service';
import type { OfficeConfigurationHead, OfficeConfigurationStore } from '@/features/office-virtual/server/office-configuration-service';
import type { OrchestratorStore } from '@/features/office-virtual/server/orchestrator-service';
import { resolveRealIntegrationStatuses } from '@/features/office-virtual/server/real-integration-status';
import { OPENROUTER_STATUS_ACTIVATES } from '@/features/office-virtual/client/central-integrations/real-integrations';
import type { WorkspaceOrchestratorBinding } from '@/features/office-virtual/client/central-orchestrator';
import { generateChatReply } from '@/features/inbox/services/openrouter';
import { getBusinessInfo, buildNowContext } from '@/features/inbox/services/business-info';
import { readJsonBody } from '@/lib/auth/workspace-access';

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

function agendaPorts(): AgendaPorts {
  const client = serviceClient();
  return {
    async createTask(workspaceId, actorUserId, input) {
      const { error } = await client.from('agenda_tasks').insert({
        workspace_id: workspaceId,
        title: input.title,
        notes: input.notes,
        scheduled_date: input.scheduledDate,
        created_by: actorUserId,
      });
      if (error) throw error;
    },
  };
}

async function resolveNowContext(workspaceId: string): Promise<string> {
  const info = await getBusinessInfo(workspaceId);
  const timezone = (info?.structured?.timezone as string | undefined) ?? undefined;
  return buildNowContext(timezone);
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
    generateReply: generateChatReply,
    agenda: agendaPorts(),
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
