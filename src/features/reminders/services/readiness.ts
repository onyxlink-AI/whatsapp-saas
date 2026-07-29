import { createClient as createSbClient } from "@supabase/supabase-js";
import { getActiveAgent } from "@/features/agents/services/active-agent";
import { getOpenRouterApiKey } from "@/features/inbox/services/openrouter";
import { getOrCreateReminderConfig } from "./reminder-config";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface ReminderReadiness {
  agentConfigured: boolean;
  openRouterAvailable: boolean;
  whatsappConnected: boolean;
  agendaConnected: boolean;
  ready: boolean;
}

/**
 * The 4 plain-language requirement checks the UI shows ("Agente configurado",
 * "OpenRouter disponible", "WhatsApp/YCloud conectado", "Agenda conectada").
 * Never invents a connected state — each check reads the same tables the
 * rest of the app already uses for these integrations.
 */
export async function getReminderReadiness(
  workspaceId: string,
): Promise<ReminderReadiness> {
  const db = svc();

  const [activeAgent, openRouterKey, config, workspaceFlags] = await Promise.all([
    getActiveAgent(workspaceId),
    getOpenRouterApiKey(workspaceId),
    getOrCreateReminderConfig(workspaceId),
    db.from("workspaces").select("whatsapp_agent_enabled, office_whatsapp_enabled").eq("id", workspaceId).maybeSingle(),
  ]);

  const { data: integrations } = await db
    .from("integrations")
    .select("provider, enabled, credentials, config")
    .eq("workspace_id", workspaceId)
    .in("provider", ["ycloud", "google_calendar", "highlevel"]);

  const rows = (integrations as
    | {
        provider: string;
        enabled: boolean;
        credentials: Record<string, unknown> | null;
        config: Record<string, unknown> | null;
      }[]
    | null) ?? [];

  const ycloud = rows.find((r) => r.provider === "ycloud");
  const whatsappConnected = Boolean(
    workspaceFlags.data?.whatsapp_agent_enabled === true &&
    workspaceFlags.data?.office_whatsapp_enabled === true &&
    ycloud?.enabled && ycloud.credentials && Object.keys(ycloud.credentials).length > 0,
  );

  // google_calendar has no per-workspace credentials (platform service
  // account) — it's "connected" once enabled with a calendar_id configured.
  // highlevel stores its Private Integration Token in credentials.
  function isSourceConnected(row: (typeof rows)[number] | undefined): boolean {
    if (!row?.enabled) return false;
    if (row.provider === "google_calendar") {
      return Boolean(row.config?.calendar_id);
    }
    return Boolean(row.credentials && Object.keys(row.credentials).length > 0);
  }

  const agendaConnected = Boolean(
    config.appointment_source &&
      isSourceConnected(rows.find((r) => r.provider === config.appointment_source)),
  );

  const agentConfigured = Boolean(activeAgent);
  const openRouterAvailable = Boolean(openRouterKey);

  return {
    agentConfigured,
    openRouterAvailable,
    whatsappConnected,
    agendaConnected,
    ready: agentConfigured && openRouterAvailable && whatsappConnected && agendaConnected,
  };
}
