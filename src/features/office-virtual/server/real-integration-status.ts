import { createClient as createServiceClient } from '@supabase/supabase-js';
import { decryptCredentials } from '@/shared/lib/crypto';
import {
  REAL_INTEGRATION_IDS,
  type ExecutionIntegrationId,
  type OpenRouterStatus,
  type RealIntegrationStatusMap,
} from '../client/central-integrations/real-integrations';

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type RealIntegrationStatus = {
  /** ycloud / highlevel / google_calendar / airtable — booleans, "saved + enabled" is the only real signal for these. */
  execution: RealIntegrationStatusMap;
  openRouter: OpenRouterStatus;
};

type IntegrationRow = {
  provider: string;
  enabled: boolean;
  credentials: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
};

/**
 * Reads whether the Oficina Virtual → Orquestador connect/verify flow
 * (openrouter-connection-service.ts) ever ran a real check against this
 * workspace's OpenRouter key and got a success back. That flow persists its
 * result into THIS SAME integrations row, under `config.office_virtual_openrouter`
 * — reading it here is a read of the existing canonical signal, never a
 * second connection system and never a live call of our own.
 */
function wasVerifiedByOrchestrator(config: Record<string, unknown> | null): boolean {
  const persisted = config?.office_virtual_openrouter;
  if (!persisted || typeof persisted !== 'object') return false;
  return (persisted as { status?: unknown }).status === 'connected';
}

async function resolveOpenRouterStatus(row: IntegrationRow | undefined): Promise<OpenRouterStatus> {
  if (!row || row.enabled !== true) return 'not_configured';

  const creds = await decryptCredentials(row.credentials);
  const hasApiKey = Boolean(creds.openrouter_api_key?.trim());
  if (!hasApiKey) return 'needs_attention';

  return wasVerifiedByOrchestrator(row.config) ? 'verified' : 'configured';
}

/**
 * The single source of truth for "is integration X ready" for specialist
 * readiness — reads the SAME `integrations` rows Ajustes → Integraciones
 * itself manages (IntegrationsTab / /api/workspace/[id]/integrations), never
 * a second connection system. Never cached; call fresh for every read.
 *
 * ycloud / highlevel / google_calendar / airtable only ever have one real
 * signal (`enabled === true` — a saved-but-disabled row is not connected,
 * mirrors resolveChannelReadiness's convention for the Chatbot feature).
 * OpenRouter has a richer, real distinction — see resolveOpenRouterStatus.
 */
export async function resolveRealIntegrationStatuses(workspaceId: string): Promise<RealIntegrationStatus> {
  const { data } = await svc()
    .from('integrations')
    .select('provider, enabled, credentials, config')
    .eq('workspace_id', workspaceId)
    .in('provider', REAL_INTEGRATION_IDS as unknown as string[]);

  const rows = (data ?? []) as IntegrationRow[];
  const execution: RealIntegrationStatusMap = {};
  for (const row of rows) {
    if (row.provider === 'openrouter') continue;
    if ((REAL_INTEGRATION_IDS as readonly string[]).includes(row.provider)) {
      execution[row.provider as ExecutionIntegrationId] = row.enabled === true;
    }
  }

  const openRouterRow = rows.find((row) => row.provider === 'openrouter');
  const openRouter = await resolveOpenRouterStatus(openRouterRow);

  return { execution, openRouter };
}
