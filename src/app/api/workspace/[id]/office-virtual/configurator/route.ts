import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { logAudit } from '@/features/audit/services/audit-log';
import {
  handleOfficeConfigurationCommand,
  loadOrProvisionOfficeConfiguration,
  type HandleOfficeConfigurationCommandInput,
  type OfficeConfigurationHead,
  type OfficeConfigurationServicePorts,
  type OfficeConfigurationStore,
} from '@/features/office-virtual/server/office-configuration-service';
import { OFFICE_SPECIALIST_ACTIONS, type OfficeConfigurationHistoryAction } from '@/features/office-virtual/client/central-integrations/configuration';
import { SPECIALIST_EXTENSION_IDS } from '@/features/office-virtual/client/central-integrations/specialist-extensions';
import { SPECIALIST_SKILL_IDS } from '@/features/office-virtual/client/central-integrations/specialist-skills';
import { CONFIGURABLE_AGENT_IDS, type ConfigurableOfficeAgentId } from '@/features/office-virtual/client/central-integrations/specialist-seats';
import { SPECIALIST_TEMPLATE_IDS } from '@/features/office-virtual/client/central-integrations/specialist-templates';
import { VERTICAL_IDS } from '@/features/office-virtual/client/central-integrations/specialist-verticals';
import { resolveRealIntegrationStatuses } from '@/features/office-virtual/server/real-integration-status';
import { OPENROUTER_STATUS_ACTIVATES } from '@/features/office-virtual/client/central-integrations/real-integrations';
import { requireSuperAdmin, readJsonBody } from '@/lib/auth/workspace-access';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type ConfigurationRow = {
  preset_id: string;
  preset_version: string;
  revision: number;
  status: 'draft' | 'published';
  document: unknown;
  updated_at: string;
  updated_by_email: string;
};

function toHead(row: ConfigurationRow): OfficeConfigurationHead {
  return {
    presetId: row.preset_id,
    presetVersion: row.preset_version,
    revision: row.revision,
    status: row.status,
    // The document JSONB is the source of truth we just wrote ourselves via
    // this same route — trusted server-internal state, not external input.
    document: row.document as OfficeConfigurationHead['document'],
    updatedAt: row.updated_at,
    updatedBy: row.updated_by_email,
  };
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
      return data ? toHead(data as ConfigurationRow) : null;
    },

    async saveHead(workspaceId, head, actorUserId) {
      const { error } = await client.from('office_virtual_configurations').upsert(
        {
          workspace_id: workspaceId,
          preset_id: head.presetId,
          preset_version: head.presetVersion,
          revision: head.revision,
          status: head.status,
          document: head.document,
          updated_by: actorUserId,
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

function ports(): OfficeConfigurationServicePorts {
  return { store: configurationStore(), resolveOpenRouterConnected: (workspaceId) => resolveOpenRouterConnectedFlag(workspaceId) };
}

async function resolveOpenRouterConnectedFlag(workspaceId: string): Promise<boolean> {
  const { openRouter } = await resolveRealIntegrationStatuses(workspaceId);
  return OPENROUTER_STATUS_ACTIVATES[openRouter];
}

const SpecialistPatchSchema = z
  .object({
    enabled: z.boolean(),
    templateId: z.enum(SPECIALIST_TEMPLATE_IDS).nullable(),
    name: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    function: z.string().trim().min(1).max(160),
    objective: z.string().trim().min(1).max(500),
    instructions: z.string().trim().min(1).max(4000),
    clientLayer: z.string().max(4000),
    model: z.string().trim().max(200).nullable(),
    extensions: z.array(z.enum(SPECIALIST_EXTENSION_IDS)).max(SPECIALIST_EXTENSION_IDS.length),
    skills: z.array(z.enum(SPECIALIST_SKILL_IDS)).max(SPECIALIST_SKILL_IDS.length),
    allowedActions: z.array(z.enum(OFFICE_SPECIALIST_ACTIONS)),
    approvalPolicy: z.enum(['always', 'sensitive_only', 'never']),
  })
  .partial()
  .strict();

const SeatIdSchema = z.enum(CONFIGURABLE_AGENT_IDS as [ConfigurableOfficeAgentId, ...ConfigurableOfficeAgentId[]]);

const CommandBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update_office'), displayName: z.string().trim().min(1).max(100) }).strict(),
  z.object({ type: z.literal('update_specialist'), agentId: SeatIdSchema, patch: SpecialistPatchSchema }).strict(),
  z.object({ type: z.literal('reset_specialist'), agentId: SeatIdSchema }).strict(),
  z.object({ type: z.literal('apply_vertical'), verticalId: z.enum(VERTICAL_IDS).nullable() }).strict(),
  z.object({ type: z.literal('publish') }).strict(),
  z.object({ type: z.literal('restore_revision'), revision: z.number().int().positive() }).strict(),
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
    const [head, integrationStatus] = await Promise.all([
      loadOrProvisionOfficeConfiguration(
        workspaceId,
        { actorId: auth.email, role: 'onyxlink_super_admin', workspaceId },
        ports(),
      ),
      resolveRealIntegrationStatuses(workspaceId),
    ]);
    return NextResponse.json({ head, realIntegrations: integrationStatus.execution, openRouterStatus: integrationStatus.openRouter });
  } catch (error) {
    console.error('[GET office-virtual/configurator]', error);
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
    return NextResponse.json({ error: 'Comando de configuración no válido' }, { status: 400 });
  }

  try {
    const commandInput = {
      requestId: crypto.randomUUID(),
      expectedRevision: parsed.data.expectedRevision,
      ...parsed.data.command,
    } as HandleOfficeConfigurationCommandInput;

    const result = await handleOfficeConfigurationCommand(
      workspaceId,
      { actorId: auth.email, role: 'onyxlink_super_admin', workspaceId },
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
      action: `office_virtual.configurator.${parsed.data.command.type}` satisfies string,
      targetType: 'office_virtual_configuration',
      targetId: workspaceId,
      summary: configuratorAuditSummary(parsed.data.command.type),
      metadata: { revision: result.document.revision, status: result.document.status },
    });

    const integrationStatus = await resolveRealIntegrationStatuses(workspaceId);
    return NextResponse.json({ document: result.document, realIntegrations: integrationStatus.execution, openRouterStatus: integrationStatus.openRouter });
  } catch (error) {
    console.error('[POST office-virtual/configurator]', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

function configuratorAuditSummary(action: OfficeConfigurationHistoryAction | string): string {
  switch (action) {
    case 'update_office':
      return 'Actualizó el nombre de la Oficina Virtual';
    case 'update_specialist':
      return 'Actualizó un puesto de especialista';
    case 'reset_specialist':
      return 'Restableció un puesto de especialista';
    case 'apply_vertical':
      return 'Aplicó un sector a la Oficina Virtual';
    case 'publish':
      return 'Publicó la configuración de la Oficina Virtual';
    case 'restore_revision':
      return 'Restauró una revisión anterior de la Oficina Virtual';
    default:
      return 'Modificó la configuración de la Oficina Virtual';
  }
}
