import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { logAudit } from '@/features/audit/services/audit-log';
import {
  handleOrchestratorCommand,
  loadOrchestratorBinding,
  type HandleOrchestratorCommandInput,
  type OrchestratorServicePorts,
  type OrchestratorStore,
} from '@/features/office-virtual/server/orchestrator-service';
import { resolveRealIntegrationStatuses } from '@/features/office-virtual/server/real-integration-status';
import { AgentIdSchema } from '@/features/office-virtual/schemas';
import type { WorkspaceOrchestratorBinding } from '@/features/office-virtual/client/central-orchestrator';
import { requireSuperAdmin, readJsonBody } from '@/lib/auth/workspace-access';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type OrchestratorRow = {
  active_mode: 'openrouter' | 'hermes_telegram';
  openrouter: WorkspaceOrchestratorBinding['openrouter'];
  hermes_telegram: WorkspaceOrchestratorBinding['hermesTelegram'];
  custom_instructions: string;
  revision: number;
};

function toBinding(workspaceId: string, row: OrchestratorRow): WorkspaceOrchestratorBinding {
  return {
    workspaceId,
    activeMode: row.active_mode,
    openrouter: row.openrouter,
    hermesTelegram: row.hermes_telegram,
    customInstructions: row.custom_instructions,
    revision: row.revision,
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
      return data ? toBinding(workspaceId, data as OrchestratorRow) : null;
    },

    async saveBinding(workspaceId, binding, actorUserId) {
      const { error } = await client.from('office_virtual_orchestrator').upsert(
        {
          workspace_id: workspaceId,
          active_mode: binding.activeMode,
          openrouter: binding.openrouter,
          hermes_telegram: binding.hermesTelegram,
          custom_instructions: binding.customInstructions,
          revision: binding.revision,
          updated_by: actorUserId,
          updated_by_email: binding.openrouter.updatedBy,
        },
        { onConflict: 'workspace_id' },
      );
      if (error) throw error;
    },
  };
}

async function resolveRealOpenRouterStatus(workspaceId: string) {
  const { openRouter } = await resolveRealIntegrationStatuses(workspaceId);
  return openRouter;
}

function ports(): OrchestratorServicePorts {
  return { store: orchestratorStore(), resolveRealOpenRouterStatus };
}

async function ensureWorkspaceIsEnabled(workspaceId: string) {
  const { data, error } = await serviceClient()
    .from('workspaces')
    .select('id, office_virtual_enabled')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false as const, status: 404, error: 'Workspace no encontrado' };
  if (!data.office_virtual_enabled) {
    return { ok: false as const, status: 409, error: 'Oficina Virtual no está activada para este workspace' };
  }
  return { ok: true as const };
}

const CommandBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('orchestrator.mode_selected'), mode: z.enum(['openrouter', 'hermes_telegram']) }).strict(),
  z.object({ type: z.literal('orchestrator.openrouter_config_updated'), model: z.string().trim().max(200).nullable() }).strict(),
  z
    .object({
      type: z.literal('orchestrator.openrouter_model_policy_updated'),
      model: z.string().trim().max(200).nullable().optional(),
      fallbackModel: z.string().trim().max(200).nullable().optional(),
      costProfile: z.enum(['economy', 'balanced', 'premium']).optional(),
      dailyRequestLimit: z.number().int().positive().nullable().optional(),
      monthlyRequestLimit: z.number().int().positive().nullable().optional(),
      allowPremiumModels: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('orchestrator.openrouter_agent_override_updated'),
      agentId: AgentIdSchema,
      override: z
        .object({
          model: z.string().trim().max(200).nullable().optional(),
          fallbackModel: z.string().trim().max(200).nullable().optional(),
          costProfile: z.enum(['economy', 'balanced', 'premium']).nullable().optional(),
          dailyRequestLimit: z.number().int().positive().nullable().optional(),
          monthlyRequestLimit: z.number().int().positive().nullable().optional(),
          allowPremiumModels: z.boolean().nullable().optional(),
        })
        .strict()
        .nullable(),
    })
    .strict(),
  z.object({ type: z.literal('orchestrator.hermes_bot_updated'), botId: z.string().trim().max(200).nullable() }).strict(),
  z.object({ type: z.literal('orchestrator.custom_instructions_updated'), instructions: z.string().max(4000) }).strict(),
]);

const PostBodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  command: CommandBodySchema,
});

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
    const binding = await loadOrchestratorBinding(workspaceId, ports());
    return NextResponse.json({ binding });
  } catch (error) {
    console.error('[GET office-virtual/orchestrator]', error);
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
  const parsed = PostBodySchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Comando de orquestador no válido' }, { status: 400 });
  }

  try {
    const workspace = await ensureWorkspaceIsEnabled(workspaceId);
    if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });

    const commandInput = {
      commandId: crypto.randomUUID(),
      expectedRevision: parsed.data.expectedRevision,
      ...parsed.data.command,
    } as HandleOrchestratorCommandInput;

    const result = await handleOrchestratorCommand(
      workspaceId,
      { actorId: auth.email, role: 'super_admin', workspaceId },
      auth.userId,
      commandInput,
      ports(),
    );

    if (!result.success) {
      return NextResponse.json({ error: result.code }, { status: 409 });
    }

    void logAudit({
      workspaceId,
      actorUserId: auth.userId,
      action: `office_virtual.orchestrator.${parsed.data.command.type.replace('orchestrator.', '')}`,
      targetType: 'office_virtual_orchestrator',
      targetId: workspaceId,
      summary: 'Actualizó la política de modelos del Orquestador',
      metadata: { revision: result.binding.revision, activeMode: result.binding.activeMode },
    });

    return NextResponse.json({ binding: result.binding });
  } catch (error) {
    console.error('[POST office-virtual/orchestrator]', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
