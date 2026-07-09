/**
 * airtable-client.ts — Airtable API client (per-workspace mirror).
 *
 * Auth: each workspace connects its own Airtable base with its own Personal
 * Access Token (stored encrypted in integrations.credentials), unlike Google
 * Calendar's single shared service account. integrations.config holds
 * base_id + table_name — not sensitive, stored plain.
 *
 * No `airtable` npm dependency: a handful of raw fetch calls against the REST
 * API, consistent with the google-calendar-client / highlevel-client style.
 *
 * The client's table must have these exact column names for the sync to
 * work — enforced by instruction in the settings UI, not by this code:
 *   Nombre, Teléfono, Email, Último mensaje, Última actividad
 * "Teléfono" is the merge key (Airtable's performUpsert), so every inbound
 * message from the same phone number updates the same row instead of adding
 * duplicates.
 */

import { createClient as createSbClient } from "@supabase/supabase-js";
import { decryptCredentials } from "@/shared/lib/crypto";
import type { ContactRow, ConversationRow } from "../types/index";

const AIRTABLE_API = "https://api.airtable.com/v0";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface AirtableConfig {
  baseId: string;
  tableName: string;
  pat: string;
}

/**
 * Loads the workspace's Airtable config (base id, table name, decrypted PAT).
 * Returns null when not connected (integration missing/disabled or fields
 * incomplete) — callers treat that as "nothing to do", never as an error.
 */
export async function getAirtableConfig(
  workspaceId: string,
): Promise<AirtableConfig | null> {
  const supabase = svc();
  const { data, error } = await supabase
    .from("integrations")
    .select("config, credentials, enabled")
    .eq("workspace_id", workspaceId)
    .eq("provider", "airtable")
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data) return null;

  const config = (data.config as Record<string, unknown> | null) ?? {};
  const baseId = config.base_id;
  const tableName = config.table_name;
  if (typeof baseId !== "string" || baseId.length === 0) return null;
  if (typeof tableName !== "string" || tableName.length === 0) return null;

  const creds = await decryptCredentials(
    data.credentials as Record<string, unknown> | null,
  );
  const pat = creds.airtable_pat;
  if (typeof pat !== "string" || pat.length === 0) return null;

  return { baseId, tableName, pat };
}

function tableUrl(cfg: Pick<AirtableConfig, "baseId" | "tableName">): string {
  return `${AIRTABLE_API}/${encodeURIComponent(cfg.baseId)}/${encodeURIComponent(cfg.tableName)}`;
}

/** Human-readable local timestamp for the "Última actividad" column — the raw
 * ISO string (UTC) is correct but unreadable in a client-facing table. */
function formatActivityTimestamp(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

/** Lightweight reachability check for the "Probar conexión" button. */
export async function testAirtableConnection(
  cfg: Pick<AirtableConfig, "baseId" | "tableName" | "pat">,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${tableUrl(cfg)}?maxRecords=1`, {
      headers: { Authorization: `Bearer ${cfg.pat}` },
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      return {
        ok: false,
        error: `Airtable respondió ${res.status}: ${body}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

/**
 * Upserts a set of fields for the row matching `phone` (merge key "Teléfono").
 * Best-effort and silent: never throws — callers fire this from webhook
 * after() jobs or fire-and-forget background evaluation, so a failure here
 * must never surface upstream. No-op when the workspace hasn't connected
 * Airtable. A partial `fields` object only touches those columns — Airtable's
 * upsert PATCH leaves every other column on the matched row untouched.
 */
async function upsertAirtableFields(
  workspaceId: string,
  phone: string,
  fields: Record<string, string>,
): Promise<void> {
  try {
    const cfg = await getAirtableConfig(workspaceId);
    if (!cfg) return;

    const res = await fetch(tableUrl(cfg), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${cfg.pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: ["Teléfono"] },
        records: [{ fields: { Teléfono: phone, ...fields } }],
      }),
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      console.error(`[airtable-sync] ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error(
      "[airtable-sync] failed:",
      err instanceof Error ? err.message : "unknown",
    );
  }
}

/**
 * Mirrors a contact + its latest message into the workspace's Airtable base.
 * Called from the webhook's after() job on every inbound message.
 */
export async function syncContactToAirtable(
  workspaceId: string,
  contact: ContactRow,
  conversation: ConversationRow,
  lastMessageText: string | null,
): Promise<void> {
  await upsertAirtableFields(workspaceId, contact.phone, {
    Nombre: contact.name ?? "",
    Email: contact.email ?? "",
    "Último mensaje": lastMessageText ?? "",
    "Última actividad": formatActivityTimestamp(conversation.last_message_at),
  });
}

export interface LeadQualificationFields {
  sector: string | null;
  problemaPrincipal: string | null;
  proximoPaso: string | null;
}

/**
 * Mirrors the setter's lead-qualification output into Airtable. Called only
 * once a lead reaches a terminal outcome (qualified or knocked out) — not on
 * every partial evaluation — so the columns fill in once per lead, not on
 * every turn.
 */
export async function syncQualificationToAirtable(
  workspaceId: string,
  phone: string,
  fields: LeadQualificationFields,
): Promise<void> {
  await upsertAirtableFields(workspaceId, phone, {
    Sector: fields.sector ?? "",
    Problema_principal: fields.problemaPrincipal ?? "",
    Proximo_paso: fields.proximoPaso ?? "",
  });
}
