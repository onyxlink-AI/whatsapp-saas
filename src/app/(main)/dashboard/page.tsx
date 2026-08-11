import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import {
  getWorkspaceMetrics,
  getRecentConversations,
  getMessageVolumeSeries,
  getConversationStateBreakdown,
} from "@/features/dashboard/services/metrics";
import { getGestionMetrics, getUpcomingAgendaItems, getStalledDeals } from "@/features/dashboard/services/gestion-metrics";
import { getOfficeVirtualDashboardSummary } from "@/features/dashboard/services/office-virtual-summary";
import { getWhatsappDashboardState } from "@/features/dashboard/services/whatsapp-status";
import { getVoiceCallMetrics } from "@/features/voice-agent/services/voice-calls";
import { listMyChannels } from "@/features/team-chat/services/team-chat-actions";
import { resolveEntitlements } from "@/features/entitlements/resolve";
import { resolveDashboardCapabilities } from "@/features/dashboard/services/capabilities";
import { ROLE_RANK, type WorkspaceRole } from "@/lib/auth/workspace-access";
import { GestionDashboardBlock } from "@/features/dashboard/components/gestion-dashboard-block";
import { CombinedDashboardBlock } from "@/features/dashboard/components/combined-dashboard-block";
import { OfficeDashboardBlock } from "@/features/dashboard/components/office-dashboard-block";
import { PlanGate } from "@/components/plan-gate";

export const dynamic = "force-dynamic";

// Fase 2 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §4):
// compositor por entitlements — resuelve el paquete UNA vez y solo ejecuta
// las consultas de los bloques que de verdad va a montar (§4.7). Nunca
// bloquea el dashboard entero por falta de WhatsApp como hacía antes: un
// workspace solo-Gestión ahora tiene panel propio en vez de un mensaje de
// "no incluido".
export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const membership = await getActiveWorkspace(supabase, user.id);

  if (!membership) {
    // Super admins without a personal workspace belong in the agency panel, not a dead end.
    const { data: userRow } = await supabase
      .from("users")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (userRow?.is_super_admin) redirect("/workspaces");
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-sm">
          No encontramos tu negocio. Pídele acceso a quien te invitó.
        </p>
      </div>
    );
  }

  const { data: workspaceFlagsRow } = await supabase
    .from("workspaces")
    .select("product_package, team_chat_enabled, vapi_assistant_id")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  const entitlements = resolveEntitlements(workspaceFlagsRow);
  const capabilities = resolveDashboardCapabilities(entitlements, {
    teamChatEnabled: workspaceFlagsRow?.team_chat_enabled === true,
    hasVapiAssistant: Boolean(workspaceFlagsRow?.vapi_assistant_id),
  });

  if (capabilities.variant === "none") {
    return <PlanGate message="Tu cuenta todavía no tiene ningún paquete activo. Pregúntale a tu gestor de Onyxlink." />;
  }

  // Los add-ons (Chat de equipo, Vapi) son independientes del paquete
  // (§2.3, revisión correctiva #3) — se resuelven aquí una sola vez y se
  // pasan a CUALQUIER variante que los tenga activados, en vez de solo a
  // la combinada. Antes el "return" temprano de la variante "gestion"
  // nunca llegaba a este bloque, así que un workspace solo-Gestión con
  // Chat de equipo o Vapi contratados no veía su widget — el paquete no
  // debe decidir qué add-ons son visibles, solo si el add-on en sí está
  // contratado/configurado.
  const [myChannels, voiceMetrics] = await Promise.all([
    capabilities.showTeamChatWidget ? listMyChannels(membership.workspace_id) : Promise.resolve([]),
    capabilities.showVapiWidget ? getVoiceCallMetrics(membership.workspace_id) : Promise.resolve(null),
  ]);
  const addons = {
    teamChatUnread: capabilities.showTeamChatWidget
      ? myChannels.reduce((sum, channel) => sum + channel.unreadCount, 0)
      : null,
    vapiRecentCalls: voiceMetrics ? voiceMetrics.totalCalls : null,
  };

  if (capabilities.variant === "gestion") {
    const [metrics, upcomingAgenda, stalledDeals] = await Promise.all([
      getGestionMetrics(membership.workspace_id),
      getUpcomingAgendaItems(membership.workspace_id),
      getStalledDeals(membership.workspace_id),
    ]);

    return (
      <GestionDashboardBlock
        metrics={metrics}
        upcomingAgenda={upcomingAgenda}
        stalledDeals={stalledDeals}
        hasWhatsappAgent={entitlements.hasWhatsappAgent}
        addons={addons}
      />
    );
  }

  if (capabilities.variant === "office") {
    // Paquete 6 (oficina, solo): sin WhatsApp ni Gestión — ni GestionDashboardBlock
    // ni CombinedDashboardBlock encajan (ambos asumen al menos una de las
    // dos), por eso su propio bloque mínimo.
    const officeSummary = await getOfficeVirtualDashboardSummary(membership.workspace_id);
    return <OfficeDashboardBlock office={officeSummary} addons={addons} />;
  }

  // variant === "combined" (whatsapp_gestion | whatsapp | whatsapp_oficina |
  // suite) — los 4 tienen WhatsApp, pero solo whatsapp_gestion y suite
  // incluyen Gestión, y solo whatsapp_oficina/suite incluyen Oficina Virtual
  // — las 3 queries de Gestión y el bloque correspondiente del panel solo se
  // piden/muestran cuando entitlements.hasGestion es true.
  const [
    whatsappMetrics,
    recentConversations,
    messageVolume,
    conversationStates,
    gestionMetrics,
    upcomingAgenda,
    stalledDeals,
    officeSummary,
  ] = await Promise.all([
    getWorkspaceMetrics(membership.workspace_id),
    getRecentConversations(membership.workspace_id, 5),
    getMessageVolumeSeries(membership.workspace_id, 14),
    getConversationStateBreakdown(membership.workspace_id),
    entitlements.hasGestion ? getGestionMetrics(membership.workspace_id) : Promise.resolve(null),
    entitlements.hasGestion ? getUpcomingAgendaItems(membership.workspace_id) : Promise.resolve([]),
    entitlements.hasGestion ? getStalledDeals(membership.workspace_id) : Promise.resolve([]),
    capabilities.showOfficeSummary ? getOfficeVirtualDashboardSummary(membership.workspace_id) : Promise.resolve(null),
  ]);

  // Revisión correctiva #4: nunca se asume "listo" solo porque
  // whatsapp_agent_enabled=true — getWhatsappDashboardState reutiliza la
  // misma comprobación real de Oficina Virtual (agente activo + YCloud
  // configurado) para distinguir "contratado sin configurar" de
  // "configurado" antes de decidir si mostrar métricas.
  const whatsappStatus = await getWhatsappDashboardState(membership.workspace_id, {
    activeConversations: whatsappMetrics.activeConversations,
    recentConversationsCount: recentConversations.length,
  });
  const canConfigureWhatsapp = ROLE_RANK[membership.role as WorkspaceRole] >= ROLE_RANK.manager;

  return (
    <CombinedDashboardBlock
      whatsapp={{
        metrics: whatsappMetrics,
        recentConversations,
        messageVolume,
        conversationStates,
      }}
      whatsappStatus={whatsappStatus}
      canConfigureWhatsapp={canConfigureWhatsapp}
      gestion={gestionMetrics ? { metrics: gestionMetrics, upcomingAgenda, stalledDeals } : null}
      office={officeSummary}
      addons={addons}
    />
  );
}
