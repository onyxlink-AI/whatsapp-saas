import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logAudit } from '@/features/audit/services/audit-log';
import {
  handleOfficeOpenRouterRequest,
  loadOfficeOpenRouterBinding,
  type OpenRouterConnectionStore,
} from '@/features/office-virtual/server/openrouter-connection-service';
import { OfficeOpenRouterRequestSchema } from '@/features/office-virtual/openrouter-connection-contract';
import { readJsonBody, requireSuperAdmin } from '@/lib/auth/workspace-access';
import { decryptCredentials } from '@/shared/lib/crypto';
import { resolveEntitlements } from '@/features/entitlements/resolve';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function connectionStore(): OpenRouterConnectionStore {
  const client = serviceClient();
  return {
    async load(workspaceId) {
      const { data, error } = await client
        .from('integrations')
        .select('id, enabled, credentials, config')
        .eq('workspace_id', workspaceId)
        .eq('provider', 'openrouter')
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        enabled: data.enabled,
        credentials: await decryptCredentials(data.credentials as Record<string, unknown> | null),
        config: (data.config as Record<string, unknown> | null) ?? {},
      };
    },

    async saveConfig(workspaceId, config) {
      const { data: existing, error: loadError } = await client
        .from('integrations')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('provider', 'openrouter')
        .maybeSingle();
      if (loadError) throw loadError;

      const query = existing
        ? client.from('integrations').update({ config, updated_at: new Date().toISOString() }).eq('id', existing.id)
        : client.from('integrations').insert({
            workspace_id: workspaceId,
            provider: 'openrouter',
            enabled: true,
            credentials: {},
            config,
            updated_at: new Date().toISOString(),
          });
      const { error } = await query;
      if (error) throw error;
    },
  };
}

async function verifyOpenRouterCredential(apiKey: string) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return { success: true as const };
    if (response.status === 401 || response.status === 403) {
      return { success: false as const, detail: 'OpenRouter rechazo la API key configurada.' };
    }
    if (response.status === 429) {
      return { success: false as const, detail: 'OpenRouter limito temporalmente la verificacion.' };
    }
    return { success: false as const, detail: 'OpenRouter no pudo verificar la conexion en este momento.' };
  } catch {
    return { success: false as const, detail: 'No se pudo contactar con OpenRouter.' };
  }
}

async function ensureWorkspaceIsEnabled(workspaceId: string) {
  const { data, error } = await serviceClient()
    .from('workspaces')
    .select('id, product_package')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false as const, status: 404, error: 'Workspace no encontrado' };
  if (!resolveEntitlements(data).hasOfficeVirtual) {
    return { ok: false as const, status: 409, error: 'Oficina Virtual no esta activada para este workspace' };
  }
  return { ok: true as const };
}

function ports() {
  return {
    store: connectionStore(),
    platformApiKey: process.env.OPENROUTER_API_KEY ?? '',
    verifyCredential: verifyOpenRouterCredential,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const { id: workspaceId } = await params;

  try {
    const workspace = await ensureWorkspaceIsEnabled(workspaceId);
    if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    const binding = await loadOfficeOpenRouterBinding(workspaceId, ports());
    return NextResponse.json({ binding });
  } catch (error) {
    console.error('[GET office-virtual/openrouter-connection]', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const { id: workspaceId } = await params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = OfficeOpenRouterRequestSchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Solicitud de conexion no valida' }, { status: 400 });
  }
  if (parsed.data.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'La solicitud no corresponde a este workspace' }, { status: 409 });
  }

  try {
    const workspace = await ensureWorkspaceIsEnabled(workspaceId);
    if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    const result = await handleOfficeOpenRouterRequest(parsed.data, auth.userId, ports());
    if (!result.success) {
      return NextResponse.json({ error: result.code }, { status: 409 });
    }

    void logAudit({
      workspaceId,
      actorUserId: auth.userId,
      action: `office_virtual.openrouter.${parsed.data.action.type}`,
      targetType: 'integration',
      targetId: result.report.connectionId,
      summary: 'Actualizo la conexion OpenRouter de Oficina Virtual',
      metadata: {
        connectionKind: result.report.connectionKind,
        status: result.report.status,
        hasCredential: result.report.hasCredential,
      },
    });
    return NextResponse.json({ report: result.report });
  } catch (error) {
    console.error('[POST office-virtual/openrouter-connection]', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
