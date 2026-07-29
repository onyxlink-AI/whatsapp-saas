import { createClient as svcClient } from '@supabase/supabase-js';

export type WhatsAppRuntimeFlags = {
  whatsapp_agent_enabled?: boolean | null;
  office_whatsapp_enabled?: boolean | null;
};

export function resolveWhatsAppRuntimeEnabled(flags: WhatsAppRuntimeFlags | null): boolean {
  return flags?.whatsapp_agent_enabled === true && flags.office_whatsapp_enabled === true;
}

export async function isWhatsAppAgentRuntimeEnabled(workspaceId: string): Promise<boolean> {
  const db = svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await db
    .from('workspaces')
    .select('whatsapp_agent_enabled, office_whatsapp_enabled')
    .eq('id', workspaceId)
    .maybeSingle();
  return resolveWhatsAppRuntimeEnabled(data);
}
