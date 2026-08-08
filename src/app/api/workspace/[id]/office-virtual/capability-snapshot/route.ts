import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  adaptSaasWorkspaceCapabilities,
  resolveWorkspaceWhatsAppBinding,
  type SaasActiveAgentRow,
  type SaasChatbotRow,
  type SaasWorkspaceCapabilityRow,
  type SaasYCloudIntegrationRow,
} from '@/features/office-virtual/client/central-integrations';
import { requireOfficeVirtualReader } from '@/features/office-virtual/server/office-virtual-access';
import { resolveChannelReadiness } from '@/features/chatbot/server/channel-readiness';
import type { ChatbotProvider } from '@/features/chatbot/types';
import { resolveEntitlements } from '@/features/entitlements/resolve';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * The SaaS only ever tracks "credentials present + enabled" for YCloud/Vapi —
 * there is no live health probe to reuse, so a richer status would be
 * invented. This is the same bar the rest of the SaaS already uses to call
 * an integration "connected".
 */
function healthFromEnabled(enabled: boolean): 'healthy' | 'unknown' {
  return enabled ? 'healthy' : 'unknown';
}

function yCloudReady(enabled: boolean, configured: boolean): boolean {
  return enabled && configured;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireOfficeVirtualReader(workspaceId);
  if (!auth.ok) return auth.response;

  try {
    const client = serviceClient();

    const { data: workspace, error: workspaceError } = await client
      .from('workspaces')
      .select(
        'id, product_package, office_whatsapp_enabled, vapi_assistant_id, advanced_memory_enabled, cross_channel_memory_enabled, pipeline_ai_enabled, cold_lead_recovery_enabled',
      )
      .eq('id', workspaceId)
      .maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace) return NextResponse.json({ error: 'Workspace no encontrado' }, { status: 404 });
    const entitlements = resolveEntitlements(workspace);
    if (!entitlements.hasOfficeVirtual) {
      return NextResponse.json({ error: 'Oficina Virtual no esta activada para este workspace' }, { status: 409 });
    }

    const { data: activeAgent, error: agentError } = await client
      .from('agents')
      .select('id, type, is_active')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .maybeSingle();
    if (agentError) throw agentError;

    const { data: ycloud, error: ycloudError } = await client
      .from('integrations')
      .select('id, enabled, config, credentials')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'ycloud')
      .maybeSingle();
    if (ycloudError) throw ycloudError;

    const workspaceRow: SaasWorkspaceCapabilityRow = {
      id: workspace.id,
      whatsapp_agent_enabled: entitlements.hasWhatsappAgent,
      office_whatsapp_enabled: workspace.office_whatsapp_enabled,
      vapi_assistant_id: workspace.vapi_assistant_id,
      advanced_memory_enabled: workspace.advanced_memory_enabled,
      cross_channel_memory_enabled: workspace.cross_channel_memory_enabled,
      pipeline_ai_enabled: workspace.pipeline_ai_enabled,
      cold_lead_recovery_enabled: workspace.cold_lead_recovery_enabled,
      virtual_office_enabled: entitlements.hasOfficeVirtual,
    };

    const activeWhatsappAgent: SaasActiveAgentRow | null = activeAgent
      ? { id: activeAgent.id, type: activeAgent.type, is_active: activeAgent.is_active }
      : null;

    const phoneNumber = (ycloud?.config as Record<string, unknown> | null)?.phone_number;
    const hasYCloudCredentials = Boolean(
      ycloud?.credentials && Object.keys(ycloud.credentials as Record<string, unknown>).length > 0,
    );
    const ycloudConfigured = typeof phoneNumber === 'string' && phoneNumber.trim().length > 0 && hasYCloudCredentials;
    const ycloudIntegration: SaasYCloudIntegrationRow | null = ycloud
      ? { provider: 'ycloud', enabled: ycloud.enabled, configured: ycloudConfigured }
      : null;

    const { data: chatbotRow, error: chatbotError } = await client
      .from('chatbots')
      .select('status, enabled, document')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (chatbotError) throw chatbotError;

    // Live re-check, not a read of the stored `enabled` flag as-is: if the
    // Agente WhatsApp was re-activated after the Chatbot was enabled for
    // 'whatsapp', the 3D office must never show it occupied — the webhook
    // itself would refuse to route to it right now (see
    // getChatbotRuntimeConfig / resolveChannelReadiness).
    const chatbotProvider = (chatbotRow?.document as { channelProvider?: ChatbotProvider | null } | null)?.channelProvider ?? null;
    const chatbotConfigured = chatbotRow?.status === 'published';
    const chatbotEnabled = Boolean(
      chatbotRow?.enabled && chatbotProvider && (await resolveChannelReadiness(workspaceId, chatbotProvider)),
    );
    const chatbot: SaasChatbotRow = { configured: chatbotConfigured, enabled: chatbotEnabled, provider: chatbotProvider };

    const capturedAt = new Date().toISOString();
    const snapshot = adaptSaasWorkspaceCapabilities({
      workspace: workspaceRow,
      activeWhatsappAgent,
      ycloudIntegration,
      ycloudHealth: { health: healthFromEnabled(yCloudReady(ycloud?.enabled === true, ycloudConfigured)) },
      voiceHealth: { health: healthFromEnabled(workspace.vapi_assistant_id !== null) },
      chatbot,
      capturedAt,
    });

    const whatsappBinding = resolveWorkspaceWhatsAppBinding(
      snapshot,
      ycloud
        ? {
            workspaceId,
            connectionId: ycloud.id,
            provider: 'ycloud',
            phoneNumber: typeof phoneNumber === 'string' ? phoneNumber : null,
            health: healthFromEnabled(ycloud.enabled),
          }
        : null,
    );

    return NextResponse.json({ snapshot, whatsappBinding });
  } catch (error) {
    console.error('[GET office-virtual/capability-snapshot]', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
