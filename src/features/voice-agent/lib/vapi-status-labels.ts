// Pure type + label map — safe to import as a VALUE from client components.
// Kept separate from vapi-verification.ts (which reads VAPI_API_KEY and
// calls fetch against Vapi's real API) so a client component can never end
// up bundling that server-only logic just to render a status badge.

export type VapiConnectionStatus =
  | "not_configured"
  | "configured"
  | "verified"
  | "needs_attention";

export const VAPI_STATUS_LABEL_ES: Record<VapiConnectionStatus, string> = {
  not_configured: "Sin configurar",
  configured: "Configurado",
  verified: "Conexión verificada",
  needs_attention: "Necesita atención",
};
