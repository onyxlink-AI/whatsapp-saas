// Real (never fabricated) connection status for a workspace's linked Vapi
// assistant. Distinct from the Oficina Virtual occupancy gate
// (isVoiceChannelReady, which only ever needs to know "is an id configured"
// so the seat shows a worker) — this is purely about what the Ajustes UI is
// allowed to tell an admin about whether that id was actually checked
// against Vapi's real API.
//
// VAPI_API_KEY is a platform-level secret (never sent to the browser, never
// per-workspace) that does not exist in this local environment on purpose —
// without it there is no way to verify anything, so the status must stay at
// "configured", never invented as "verified".
//
// This module reads env vars and calls fetch() — server-only. Client
// components must import the type/labels from ../lib/vapi-status-labels
// instead, never this file, so none of this ever gets bundled client-side.

import type { VapiConnectionStatus } from "../lib/vapi-status-labels";

export interface VapiConnectionResult {
  status: VapiConnectionStatus;
  /** Only set for needs_attention — never includes the API key or raw Vapi response body. */
  detail: string | null;
}

const VAPI_API_BASE = "https://api.vapi.ai";

export async function getVapiConnectionStatus(
  assistantId: string | null,
): Promise<VapiConnectionResult> {
  if (!assistantId) {
    return { status: "not_configured", detail: null };
  }

  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    // No platform key configured locally (or at all yet) — an id being
    // present is real, but "verified" would be fabricated without an
    // actual check, so this stays at the honest middle state.
    return { status: "configured", detail: null };
  }

  try {
    const res = await fetch(`${VAPI_API_BASE}/assistant/${encodeURIComponent(assistantId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      return { status: "verified", detail: null };
    }
    return {
      status: "needs_attention",
      detail: `Vapi respondió con un error (${res.status})`,
    };
  } catch {
    return {
      status: "needs_attention",
      detail: "No se pudo contactar con Vapi",
    };
  }
}
