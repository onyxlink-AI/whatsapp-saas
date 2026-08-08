// whatsapp-status.ts — estado real del Agente de WhatsApp para el dashboard
// combinado (revisión correctiva de Fase 2, bloqueo #4): distingue
// "contratado sin proveedor/agente configurado" de "configurado sin
// actividad"/"configurado con actividad"/"error operativo" — nunca trata
// whatsapp_agent_enabled=true como sinónimo de "listo". Reutiliza la MISMA
// comprobación de readiness real que ya usa Oficina Virtual
// (getWhatsAppOfficeActivationBlocker, en
// src/features/office-virtual/server/whatsapp-office-activation.ts) en vez
// de inventar un segundo criterio de "configurado".
//
// Solo se llama cuando el caller ya sabe (por entitlements) que el paquete
// incluye WhatsApp — por eso no repite esa comprobación aquí.

import { createClient as createSbClient } from "@supabase/supabase-js";
import { getWhatsAppOfficeActivationBlocker } from "@/features/office-virtual/server/whatsapp-office-activation";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type WhatsappDashboardStatus = "pending_setup" | "empty" | "active" | "operational_error";

export interface WhatsappDashboardState {
  status: WhatsappDashboardStatus;
  /** Texto genérico y accionable para el cliente — nunca el error técnico crudo del proveedor. */
  detail: string | null;
}

const FAILED_MESSAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

const GENERIC_QUERY_ERROR_DETAIL =
  "No se pudo verificar el estado del Agente de WhatsApp en este momento. Intenta de nuevo en unos minutos.";
const GENERIC_DELIVERY_FAILURE_DETAIL =
  "Hay mensajes que no se pudieron entregar durante las últimas 24 horas. Revisa la conexión de WhatsApp.";

export async function getWhatsappDashboardState(
  workspaceId: string,
  activity: { activeConversations: number; recentConversationsCount: number },
): Promise<WhatsappDashboardState> {
  const db = svc();

  // Existencia segura: select de solo "id" con limit(1) en vez de
  // maybeSingle(), que devuelve un error de PostgREST (PGRST116, "multiple
  // rows returned") si el workspace llega a tener más de un agente activo
  // a la vez — un caso que no debe clasificarse como "sin configurar".
  const [agentResult, ycloudResult] = await Promise.all([
    db.from("agents").select("id").eq("workspace_id", workspaceId).eq("is_active", true).limit(1),
    db.from("integrations").select("enabled, config, credentials").eq("workspace_id", workspaceId).eq("provider", "ycloud").maybeSingle(),
  ]);

  if (agentResult.error || ycloudResult.error) {
    console.error(
      "[whatsapp-status] fallo al consultar agente/YCloud",
      workspaceId,
      agentResult.error?.message,
      ycloudResult.error?.message,
    );
    return { status: "operational_error", detail: GENERIC_QUERY_ERROR_DETAIL };
  }

  const hasActiveAgent = (agentResult.data?.length ?? 0) > 0;
  const ycloud = ycloudResult.data;
  const phoneNumber = (ycloud?.config as Record<string, unknown> | null)?.phone_number;
  const ycloudConfigured = Boolean(
    ycloud?.enabled === true &&
    typeof phoneNumber === "string" &&
    phoneNumber.trim().length > 0 &&
    ycloud.credentials &&
    Object.keys(ycloud.credentials as Record<string, unknown>).length > 0,
  );

  const blocker = getWhatsAppOfficeActivationBlocker({
    productEnabled: true,
    selectedAgent: hasActiveAgent,
    ycloudConfigured,
  });
  if (blocker) return { status: "pending_setup", detail: blocker };

  const since = new Date(Date.now() - FAILED_MESSAGE_WINDOW_MS).toISOString();
  const { data: recentFailures, error: messagesError } = await db
    .from("messages")
    .select("error_message")
    .eq("workspace_id", workspaceId)
    .eq("status", "failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (messagesError) {
    // No bloquea el resto del dashboard por esto — solo significa que no
    // podemos confirmar si hay fallos de entrega recientes. Se registra en
    // el log del servidor (sin credenciales) para diagnóstico y se sigue
    // con la distinción vacío/activo normal.
    console.error("[whatsapp-status] fallo al consultar mensajes fallidos", workspaceId, messagesError.message);
  } else if (recentFailures && recentFailures.length > 0) {
    // El detalle técnico (error_message, puede incluir datos del proveedor)
    // se registra solo en el log del servidor — el cliente recibe siempre
    // el mismo texto genérico y accionable, nunca el error crudo.
    console.error(
      "[whatsapp-status] mensaje de WhatsApp sin entregar",
      workspaceId,
      recentFailures[0].error_message ?? "(sin detalle)",
    );
    return { status: "operational_error", detail: GENERIC_DELIVERY_FAILURE_DETAIL };
  }

  const hasActivity = activity.activeConversations > 0 || activity.recentConversationsCount > 0;
  return { status: hasActivity ? "active" : "empty", detail: null };
}
