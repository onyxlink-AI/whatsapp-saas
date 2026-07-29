import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  handleChatbotCommand,
  loadOrProvisionChatbot,
  type ChatbotCommandInput,
  type ChatbotHead,
  type ChatbotServicePorts,
  type ChatbotStore,
} from '@/features/chatbot/server/chatbot-service';
import { ChatbotPostBodySchema } from '@/features/chatbot/validation';
import type { ChatbotStatus } from '@/features/chatbot/types';
import { resolveChannelReadiness } from '@/features/chatbot/server/channel-readiness';
import { logAudit } from '@/features/audit/services/audit-log';
import { requireSuperAdmin, readJsonBody } from '@/lib/auth/workspace-access';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type ChatbotRow = {
  revision: number;
  status: ChatbotStatus;
  enabled: boolean;
  document: unknown;
  updated_at: string;
  updated_by_email: string;
};

function toHead(row: ChatbotRow): ChatbotHead {
  return {
    revision: row.revision,
    status: row.status,
    enabled: row.enabled,
    // The document JSONB is the source of truth we just wrote ourselves via
    // this same route — trusted server-internal state, not external input.
    document: row.document as ChatbotHead['document'],
    updatedAt: row.updated_at,
    updatedBy: row.updated_by_email,
  };
}

function chatbotStore(): ChatbotStore {
  const client = serviceClient();
  return {
    async loadHead(workspaceId) {
      const { data, error } = await client
        .from('chatbots')
        .select('revision, status, enabled, document, updated_at, updated_by_email')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error) throw error;
      return data ? toHead(data as ChatbotRow) : null;
    },

    async saveHead(workspaceId, head, actorUserId) {
      const { error } = await client.from('chatbots').upsert(
        {
          workspace_id: workspaceId,
          revision: head.revision,
          status: head.status,
          enabled: head.enabled,
          document: head.document,
          updated_by: actorUserId,
          updated_by_email: head.updatedBy,
        },
        { onConflict: 'workspace_id' },
      );
      if (error) throw error;
    },

    async appendRevision(workspaceId, entry) {
      const { error } = await client.from('chatbot_revisions').insert({
        workspace_id: workspaceId,
        revision: entry.revision,
        action: entry.action,
        actor_user_id: entry.actorUserId,
        actor_email: entry.actorEmail,
        document: entry.document,
        occurred_at: entry.occurredAt,
      });
      if (error) throw error;
    },
  };
}

async function channelEligibility(workspaceId: string) {
  const [whatsapp, telegram] = await Promise.all([
    resolveChannelReadiness(workspaceId, 'whatsapp'),
    resolveChannelReadiness(workspaceId, 'telegram'),
  ]);
  return {
    whatsapp: {
      eligible: whatsapp,
      reason: whatsapp ? null : 'Este workspace tiene el Agente de WhatsApp activo, o YCloud no está configurado. Desactiva el Agente de WhatsApp o configura YCloud primero.',
    },
    telegram: {
      eligible: telegram,
      reason: telegram ? null : 'Configura un bot de Telegram en Settings → Integraciones primero.',
    },
  };
}

function ports(): ChatbotServicePorts {
  return { store: chatbotStore(), resolveChannelReadiness };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  try {
    const head = await loadOrProvisionChatbot(workspaceId, { actorId: auth.userId, role: 'workspace_admin' }, ports());
    const channels = await channelEligibility(workspaceId);
    return NextResponse.json({ head, channels });
  } catch (error) {
    console.error('[GET chatbot]', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = ChatbotPostBodySchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Comando de chatbot no válido' }, { status: 400 });
  }

  try {
    const commandInput = {
      expectedRevision: parsed.data.expectedRevision,
      ...parsed.data.command,
    } as ChatbotCommandInput;

    const result = await handleChatbotCommand(
      workspaceId,
      { actorId: auth.userId, role: 'workspace_admin' },
      auth.userId,
      commandInput,
      ports(),
    );

    if (!result.success) {
      return NextResponse.json({ error: result.code, issues: 'issues' in result ? result.issues : undefined }, { status: 409 });
    }

    void logAudit({
      workspaceId,
      actorUserId: auth.userId,
      action: `chatbot.${parsed.data.command.type}` satisfies string,
      targetType: 'chatbot',
      targetId: workspaceId,
      summary: auditSummary(parsed.data.command.type),
      metadata: { revision: result.document.revision, status: result.document.status },
    });

    const channels = await channelEligibility(workspaceId);
    return NextResponse.json({ document: result.document, channels });
  } catch (error) {
    console.error('[POST chatbot]', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

function auditSummary(action: string): string {
  switch (action) {
    case 'update_draft':
      return 'Actualizó la configuración del Chatbot';
    case 'select_channel':
      return 'Cambió el canal del Chatbot';
    case 'publish':
      return 'Publicó el Chatbot';
    case 'set_enabled':
      return 'Cambió el estado activo del Chatbot';
    default:
      return 'Modificó la configuración del Chatbot';
  }
}
