/**
 * zoom-client.ts — Zoom API client (Server-to-Server OAuth).
 *
 * Auth: a single Zoom "Server-to-Server OAuth" app, configured once at the
 * platform level (ZOOM_ACCOUNT_ID + ZOOM_CLIENT_ID + ZOOM_CLIENT_SECRET env
 * vars — never per-workspace), mirroring google-calendar-client.ts's service
 * account. Unlike Google Calendar, a Server-to-Server app can only create
 * meetings hosted by a user that belongs to THAT SAME Zoom account — not an
 * arbitrary external Zoom user — so each workspace just picks which of the
 * account's users hosts its meetings (`host_email`), same shape as Google
 * Calendar's per-workspace `calendar_id`.
 *
 * This exists because Google rejects auto-generated Meet links for this
 * setup ("Invalid conference type value" — needs Workspace domain-wide
 * delegation); Zoom's API returns a real join_url with no such requirement.
 */

import { createClient as createSbClient } from "@supabase/supabase-js";

const OAUTH_TOKEN_URL = "https://zoom.us/oauth/token";
const ZOOM_API = "https://api.zoom.us/v2";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Workspace config
// ──────────────────────────────────────────────────────────────────────────────

export interface ZoomConfig {
  hostEmail: string;
}

/** Loads the workspace's Zoom config (just which account user hosts its meetings). Returns null when not connected. */
export async function getZoomConfig(
  workspaceId: string,
): Promise<ZoomConfig | null> {
  const supabase = svc();
  const { data, error } = await supabase
    .from("integrations")
    .select("config, enabled")
    .eq("workspace_id", workspaceId)
    .eq("provider", "zoom")
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data) return null;

  const config = (data.config as Record<string, unknown> | null) ?? {};
  const hostEmail = config.host_email;
  if (typeof hostEmail !== "string" || hostEmail.length === 0) return null;

  return { hostEmail };
}

// ──────────────────────────────────────────────────────────────────────────────
// Server-to-Server OAuth (account_credentials grant → access token)
// ──────────────────────────────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Exchanges the platform Zoom app's credentials for a short-lived access
 * token. Cached in-memory for the life of the serverless instance (tokens
 * last 1h). Throws when the app's env vars are missing/misconfigured.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      "ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET no configuradas",
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const url = new URL(OAUTH_TOKEN_URL);
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", accountId);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  if (!res.ok) {
    throw new Error(
      `Zoom token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

// ──────────────────────────────────────────────────────────────────────────────
// Meeting creation
// ──────────────────────────────────────────────────────────────────────────────

export interface CreateZoomMeetingInput {
  hostEmail: string;
  topic: string;
  startIso: string;
  durationMinutes: number;
  timezone: string;
}

export async function createZoomMeeting(
  input: CreateZoomMeetingInput,
): Promise<{ id: string; joinUrl: string }> {
  const token = await getAccessToken();

  const res = await fetch(
    `${ZOOM_API}/users/${encodeURIComponent(input.hostEmail)}/meetings`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: input.topic,
        type: 2, // scheduled meeting
        start_time: input.startIso,
        duration: input.durationMinutes,
        timezone: input.timezone,
        settings: { join_before_host: true },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Zoom meetings.create error: ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as { id: number; join_url: string };
  return { id: String(json.id), joinUrl: json.join_url };
}

/** Lightweight reachability check for the "Probar conexión" button — confirms hostEmail is a real user on this Zoom account. */
export async function testZoomConnection(
  hostEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`${ZOOM_API}/users/${encodeURIComponent(hostEmail)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        error:
          res.status === 404
            ? `"${hostEmail}" no es un usuario de esta cuenta de Zoom.`
            : `Error ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}
