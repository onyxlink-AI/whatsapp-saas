/**
 * google-calendar-client.ts — Google Calendar API client (service account).
 *
 * Auth: a single Google service account, configured once at the platform
 * level (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY env
 * vars — never per-workspace). Each client grants access by sharing their own
 * Google Calendar with that service account email ("Make changes to events").
 * The workspace only stores which calendar_id to use — no secrets per tenant.
 *
 * No googleapis/google-auth-library dependency: the JWT Bearer flow (RFC 7523)
 * is a handful of lines with node:crypto, so we sign it directly.
 */

import { createSign } from "node:crypto";
import { createClient as createSbClient } from "@supabase/supabase-js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Workspace config
// ──────────────────────────────────────────────────────────────────────────────

export interface GoogleCalendarConfig {
  calendarId: string;
  timezone: string;
  businessHoursStart: number; // 0-23
  businessHoursEnd: number; // 0-23
  slotMinutes: number;
}

/**
 * Loads the workspace's Google Calendar config (just the calendar id + a few
 * scheduling defaults). Returns null when not connected (no calendar_id).
 */
export async function getGoogleCalendarConfig(
  workspaceId: string,
): Promise<GoogleCalendarConfig | null> {
  const supabase = svc();
  const { data, error } = await supabase
    .from("integrations")
    .select("config, enabled")
    .eq("workspace_id", workspaceId)
    .eq("provider", "google_calendar")
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data) return null;

  const config = (data.config as Record<string, unknown> | null) ?? {};
  const calendarId = config.calendar_id;
  if (typeof calendarId !== "string" || calendarId.length === 0) return null;

  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  return {
    calendarId,
    timezone:
      typeof config.timezone === "string" && config.timezone.length > 0
        ? config.timezone
        : "America/Mexico_City",
    businessHoursStart: num(config.business_hours_start, 9),
    businessHoursEnd: num(config.business_hours_end, 18),
    slotMinutes: num(config.slot_minutes, 30),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Service-account auth (JWT Bearer → access token)
// ──────────────────────────────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input)).toString(
    "base64url",
  );
}

/**
 * Exchanges the platform service account for a short-lived access token.
 * Cached in-memory for the life of the serverless instance (tokens last 1h).
 * Throws when the service account env vars are missing/misconfigured.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY no configuradas",
    );
  }
  // Tolerate surrounding quotes: Next.js's local .env loader strips them like
  // dotenv, but the Vercel dashboard/CLI stores env var values completely
  // literally, quotes included, if you paste them in.
  const unquoted = rawKey.replace(/^['"]|['"]$/g, "");
  const privateKey = unquoted.replace(/\\n/g, "\n");

  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Google token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

// ──────────────────────────────────────────────────────────────────────────────
// Timezone helpers (mirrors the offset trick used for the prompt's "now" block)
// ──────────────────────────────────────────────────────────────────────────────

function utcOffsetFor(timeZone: string, referenceDate: Date): string {
  const raw =
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(referenceDate)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  return raw.replace("GMT", "") || "+00:00";
}

/** Builds a real Date for `dateStr` (YYYY-MM-DD) at local hour:minute in `timeZone`. */
function zonedDateTime(
  dateStr: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const offset = utcOffsetFor(timeZone, new Date(`${dateStr}T12:00:00Z`));
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00${offset}`);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// ──────────────────────────────────────────────────────────────────────────────
// FreeBusy + slot generation
// ──────────────────────────────────────────────────────────────────────────────

export interface BusyPeriod {
  start: string;
  end: string;
}

async function freeBusyQuery(
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<BusyPeriod[]> {
  const token = await getAccessToken();
  const res = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Google freeBusy error: ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    calendars?: Record<string, { busy?: BusyPeriod[]; errors?: unknown[] }>;
  };
  const cal = json.calendars?.[calendarId];
  if (cal?.errors && cal.errors.length > 0) {
    throw new Error(
      `Google Calendar no accesible (¿se compartió con la cuenta de servicio?): ${JSON.stringify(cal.errors)}`,
    );
  }
  return cal?.busy ?? [];
}

function overlapsBusy(
  slotStart: Date,
  slotEnd: Date,
  busy: BusyPeriod[],
): boolean {
  return busy.some((b) => {
    const bStart = new Date(b.start).getTime();
    const bEnd = new Date(b.end).getTime();
    return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
  });
}

/**
 * Pure slot-generation math, split out from getFreeSlotsGoogle so it can be
 * unit-tested without a live Google Calendar/network call. Given the busy
 * periods already fetched from freeBusy, walks [dateFrom, dateTo] in
 * cfg.slotMinutes steps within business hours, skipping anything in the past
 * or overlapping a busy period, capped at 30 slots total.
 */
export function computeFreeSlots(
  cfg: GoogleCalendarConfig,
  dateFrom: string,
  dateTo: string,
  busy: BusyPeriod[],
  nowMs: number = Date.now(),
): string[] {
  const slots: string[] = [];
  let day = dateFrom;
  while (day <= dateTo) {
    let hour = cfg.businessHoursStart;
    let minute = 0;
    while (hour < cfg.businessHoursEnd) {
      const start = zonedDateTime(day, hour, minute, cfg.timezone);
      const end = new Date(start.getTime() + cfg.slotMinutes * 60_000);
      if (start.getTime() > nowMs && !overlapsBusy(start, end, busy)) {
        slots.push(start.toISOString());
      }
      minute += cfg.slotMinutes;
      if (minute >= 60) {
        hour += Math.floor(minute / 60);
        minute = minute % 60;
      }
      if (slots.length >= 30) break; // keep the prompt lean, same cap as HighLevel's tool
    }
    if (slots.length >= 30) break;
    day = addDays(day, 1);
  }

  return slots;
}

/**
 * Returns free slot start times (ISO, with offset) within business hours for
 * each day in [dateFrom, dateTo], filtering out anything that overlaps a busy
 * period or that's already in the past.
 */
export async function getFreeSlotsGoogle(
  cfg: GoogleCalendarConfig,
  dateFrom: string,
  dateTo: string,
): Promise<string[]> {
  const timeMin = zonedDateTime(dateFrom, 0, 0, cfg.timezone).toISOString();
  const timeMax = zonedDateTime(
    addDays(dateTo, 1),
    0,
    0,
    cfg.timezone,
  ).toISOString();

  const busy = await freeBusyQuery(cfg.calendarId, timeMin, timeMax);

  return computeFreeSlots(cfg, dateFrom, dateTo, busy);
}

// ──────────────────────────────────────────────────────────────────────────────
// Event creation
// ──────────────────────────────────────────────────────────────────────────────

export interface CreateEventInput {
  calendarId: string;
  startIso: string;
  durationMinutes: number;
  summary: string;
  description?: string;
}

export async function createGoogleEvent(
  input: CreateEventInput,
): Promise<{ id: string; htmlLink?: string }> {
  const token = await getAccessToken();
  const start = new Date(input.startIso);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);

  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(input.calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Google events.insert error: ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as { id: string; htmlLink?: string };
  return json;
}

/** Lightweight reachability check for the "Probar conexión" button. */
export async function testGoogleCalendarConnection(
  calendarId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const now = new Date();
    const later = new Date(now.getTime() + 60_000);
    await freeBusyQuery(calendarId, now.toISOString(), later.toISOString());
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
