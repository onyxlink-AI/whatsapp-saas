import { createClient as createSbClient } from "@supabase/supabase-js";
import { decryptCredentials } from "@/shared/lib/crypto";

/**
 * Resolvedor ESTRICTO y compartido de la integración OpenRouter cifrada de
 * un workspace concreto. Nunca lee `process.env.OPENROUTER_API_KEY` (la
 * clave de plataforma) ni ninguna otra clave global — fail-closed: si no
 * hay una integración real, habilitada y descifrable para ESE workspace,
 * no hay clave, punto. Usado tanto por "Generar guion con IA"
 * (content-script-ai.ts) como por el chat real de la Oficina Virtual
 * (office-virtual/chat/route.ts) — una sola implementación, nunca dos
 * resolvedores que puedan divergir.
 */
export type WorkspaceOpenRouterCredential =
  | { status: "ready"; apiKey: string }
  /** Nunca existió una fila de integración (o existe pero nunca se guardó ninguna clave). */
  | { status: "not_configured" }
  /** La fila existe y en algún momento tuvo credenciales, pero el cliente la apagó (`enabled=false`). */
  | { status: "disabled" }
  /** La credencial guardada no se pudo descifrar — dato corrupto, no "sin configurar". */
  | { status: "decrypt_error" }
  | { status: "error" };

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function getWorkspaceOpenRouterCredential(workspaceId: string): Promise<WorkspaceOpenRouterCredential> {
  const { data, error } = await svc()
    .from("integrations")
    .select("enabled, credentials")
    .eq("workspace_id", workspaceId)
    .eq("provider", "openrouter")
    .maybeSingle();

  if (error) {
    console.error("[openrouter-credential] error leyendo la integración OpenRouter del workspace:", error.message);
    return { status: "error" };
  }
  if (!data) {
    return { status: "not_configured" };
  }

  // El descifrado puede lanzar (dato corrupto/formato inesperado) — nunca
  // debe propagar como una excepción sin controlar hasta el caller.
  let creds: Record<string, unknown>;
  try {
    creds = await decryptCredentials(data.credentials as Record<string, unknown> | null);
  } catch (err) {
    console.error("[openrouter-credential] error descifrando la credencial OpenRouter:", err instanceof Error ? err.message : err);
    return { status: "decrypt_error" };
  }

  const apiKey = creds.openrouter_api_key;
  const hasKey = typeof apiKey === "string" && apiKey.length > 0;

  if (data.enabled !== true) {
    return hasKey ? { status: "disabled" } : { status: "not_configured" };
  }
  if (!hasKey) {
    return { status: "not_configured" };
  }
  return { status: "ready", apiKey };
}
