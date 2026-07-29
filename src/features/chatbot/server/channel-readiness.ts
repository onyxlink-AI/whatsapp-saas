import { createClient as createServiceClient } from '@supabase/supabase-js';
import { decryptCredentials } from '@/shared/lib/crypto';
import type { ChatbotProvider } from '../types';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Live eligibility for a Chatbot channel — never cached, never persisted as
 * "connection state", and shared by every caller (the Chatbot's own
 * configurator route, the YCloud webhook, and the Telegram webhook) so
 * there is exactly one place this logic can drift.
 *
 * WhatsApp: the Chatbot may only own the workspace's one YCloud number when
 * there is no active Agente WhatsApp for it (mutual exclusion — a workspace
 * has exactly one YCloud connection, UNIQUE(workspace_id, provider)).
 * Telegram: just requires an enabled integration with a bot token present.
 */
export async function resolveChannelReadiness(workspaceId: string, provider: ChatbotProvider): Promise<boolean> {
  const client = serviceClient();

  if (provider === 'whatsapp') {
    const [{ data: workspace }, { data: activeAgent }, { data: ycloud }] = await Promise.all([
      client.from('workspaces').select('whatsapp_agent_enabled').eq('id', workspaceId).maybeSingle(),
      client.from('agents').select('id').eq('workspace_id', workspaceId).eq('is_active', true).maybeSingle(),
      client.from('integrations').select('enabled').eq('workspace_id', workspaceId).eq('provider', 'ycloud').maybeSingle(),
    ]);
    const agenteWhatsAppActive = workspace?.whatsapp_agent_enabled === true && activeAgent !== null;
    return !agenteWhatsAppActive && ycloud?.enabled === true;
  }

  const { data: telegram } = await client
    .from('integrations')
    .select('credentials, enabled')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'telegram')
    .maybeSingle();
  if (!telegram?.enabled) return false;
  const creds = await decryptCredentials(telegram.credentials as Record<string, unknown> | null);
  return Boolean(creds.telegram_bot_token);
}
