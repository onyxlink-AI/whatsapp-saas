import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { listAgents } from "@/features/agents/services/agent-queries";
import { SettingsShell } from "@/features/settings/components/settings-shell";
import { getVapiConnectionStatus } from "@/features/voice-agent/services/vapi-verification";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const membership = await getActiveWorkspace(supabase, user.id);

  if (!membership) {
    // Super admins without a workspace belong in the agency panel, not a dead end.
    const { data: userRow } = await supabase
      .from("users")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (userRow?.is_super_admin) {
      redirect("/workspaces");
    }
    return (
      <div className="p-8 text-sm text-muted-foreground">
        No tienes una empresa asignada. Contacta al administrador.
      </div>
    );
  }

  const workspaceId = membership.workspace_id as string;

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [
    { data: biData },
    { data: toolsData },
    { data: toolConfigsData },
    { data: integrationsData },
    { data: workspaceData },
    { data: userRowForAddons },
  ] = await Promise.all([
    svc
      .from("business_info")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single(),
    svc.from("tools").select("*").order("name"),
    svc
      .from("tool_configs")
      .select("tool_id, enabled, config")
      .eq("workspace_id", workspaceId),
    svc
      .from("integrations")
      .select("provider, enabled, credentials, oauth_tokens, config")
      .eq("workspace_id", workspaceId),
    svc
      .from("workspaces")
      .select("advanced_memory_enabled, pipeline_ai_enabled, cold_lead_recovery_enabled, vapi_assistant_id, cross_channel_memory_enabled, whatsapp_agent_enabled, gestion_enabled, office_virtual_enabled, chatbot_enabled, help_assistant_actions_enabled, whiteboard_enabled")
      .eq("id", workspaceId)
      .single(),
    svc.from("users").select("is_super_admin").eq("id", user.id).maybeSingle(),
  ]);

  // Paid add-ons (Memoria Avanzada / Pipeline IA / Recuperación de leads) are
  // only togglable by Onyxlink — the client's own workspace "admin" role
  // isn't enough to tell them apart from an agency operator (see
  // requireSuperAdmin's doc comment). The toggles stay visible to the client
  // for transparency, just locked.
  const isSuperAdmin = userRowForAddons?.is_super_admin === true;

  const initialAgents = await listAgents(svc, workspaceId);

  // Mask credentials server-side before passing to client components
  function maskRecord(
    obj: Record<string, unknown> | null,
  ): Record<string, string> {
    if (!obj) return {};
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, v ? "••••••" : ""]),
    );
  }

  const maskedIntegrations = (integrationsData ?? []).map(
    (row: Record<string, unknown>) => ({
      provider: row.provider,
      enabled: row.enabled,
      config: (row.config as Record<string, unknown>) ?? {},
      credentials: maskRecord(
        (row.credentials as Record<string, unknown>) ?? null,
      ),
      oauth_tokens: maskRecord(
        (row.oauth_tokens as Record<string, unknown>) ?? null,
      ),
    }),
  );

  const enabledToolIds = new Set(
    (toolConfigsData ?? [])
      .filter((t) => t.enabled)
      .map((t) => t.tool_id as string),
  );
  const configByToolId = new Map(
    (toolConfigsData ?? []).map((t) => [
      t.tool_id as string,
      (t.config as Record<string, unknown> | null) ?? null,
    ]),
  );

  const toolsWithEnabled = (toolsData ?? []).map(
    (tool: Record<string, unknown>) => ({
      id: tool.id as string,
      key: tool.key as string,
      name: tool.name as string,
      description: (tool.description as string | null) ?? "",
      sensitivity: (tool.sensitivity as string) ?? "read",
      enabled: enabledToolIds.has(tool.id as string),
      config: configByToolId.get(tool.id as string) ?? null,
    }),
  );

  const vapiAssistantId = (workspaceData?.vapi_assistant_id as string | null) ?? null;
  // Server-only: the VAPI_API_KEY used inside this call never reaches the
  // client — only the resulting status label does.
  const vapiStatus = await getVapiConnectionStatus(vapiAssistantId);

  return (
    <SettingsShell
      workspaceId={workspaceId}
      role={membership.role as string}
      initialBusinessInfo={biData ?? null}
      initialTools={toolsWithEnabled}
      initialIntegrations={maskedIntegrations}
      initialAgents={initialAgents}
      googleServiceAccountEmail={process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}
      initialAdvancedMemoryEnabled={workspaceData?.advanced_memory_enabled === true}
      initialPipelineAiEnabled={workspaceData?.pipeline_ai_enabled === true}
      initialColdLeadRecoveryEnabled={workspaceData?.cold_lead_recovery_enabled === true}
      initialVapiAssistantId={vapiAssistantId}
      initialVapiStatus={vapiStatus.status}
      initialCrossChannelMemoryEnabled={workspaceData?.cross_channel_memory_enabled === true}
      isSuperAdmin={isSuperAdmin}
      hasWhatsappAgent={workspaceData?.whatsapp_agent_enabled !== false}
      initialGestionEnabled={workspaceData?.gestion_enabled === true}
      initialOfficeVirtualEnabled={workspaceData?.office_virtual_enabled === true}
      initialChatbotEnabled={workspaceData?.chatbot_enabled === true}
      initialHelpAssistantActionsEnabled={workspaceData?.help_assistant_actions_enabled === true}
      initialWhiteboardEnabled={workspaceData?.whiteboard_enabled === true}
    />
  );
}
