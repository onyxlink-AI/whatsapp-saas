import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient as svcClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  requireWorkspaceMember,
  readJsonBody,
  ROLE_RANK,
} from "@/lib/auth/workspace-access";
import { encryptCredentials, decryptCredentials } from "@/shared/lib/crypto";
import { isValidIanaTimezone } from "@/shared/lib/timezone";
import { logAudit } from "@/features/audit/services/audit-log";
import { setTelegramWebhook } from "@/features/chatbot/server/telegram-client";

const IntegrationSchema = z.object({
  provider: z.enum([
    "ycloud",
    "openrouter",
    "highlevel",
    "google_calendar",
    "airtable",
    "telegram",
    "zoom",
  ]),
  enabled: z.boolean().optional(),
  credentials: z.record(z.string(), z.string()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

type IntegrationRow = {
  id: string;
  provider: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  credentials: Record<string, unknown> | null;
  oauth_tokens: Record<string, unknown> | null;
};

function maskRecord(
  obj: Record<string, unknown> | null,
): Record<string, string> {
  if (!obj) return {};
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v ? "••••••" : ""]),
  );
}

// GET: return integrations with masked credentials
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const svc = svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await svc
    .from("integrations")
    .select("id, provider, enabled, config, credentials, oauth_tokens")
    .eq("workspace_id", workspaceId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const masked = await Promise.all(
    ((data ?? []) as IntegrationRow[]).map(async (row) => {
      const base = {
        id: row.id,
        provider: row.provider,
        enabled: row.enabled,
        config: row.config ?? {},
        credentials: maskRecord(row.credentials),
        oauth_tokens: maskRecord(row.oauth_tokens),
      };

      // The HighLevel inbound-sync webhook token is low-sensitivity (it only
      // authorizes inbound contact-sync), so admins/managers who actually
      // configure the integration see it unmasked (decrypted) plus a
      // prebuilt URL to paste into HighLevel's dashboard. A plain agent/
      // viewer has no reason to read this secret, so they get the same
      // masked shape as every other provider.
      if (row.provider === "highlevel" && ROLE_RANK[auth.role] >= ROLE_RANK.manager) {
        const decrypted = await decryptCredentials(row.credentials);
        const secret = decrypted.highlevel_webhook_secret ?? "";
        return {
          ...base,
          highlevel_webhook_secret: secret,
          highlevel_webhook_url: secret
            ? `${appUrl}/api/webhooks/highlevel?wsid=${workspaceId}&token=${secret}`
            : "",
        };
      }

      return base;
    }),
  );

  return NextResponse.json({ integrations: masked });
}

// PUT: upsert integration — only write fields that are NOT masked placeholder
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, {
    minRole: "manager",
  });
  if (!auth.ok) return auth.response;

  const parsedBody = await readJsonBody(req);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = IntegrationSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Google Calendar's timezone must be a real IANA identifier (e.g.
  // "Europe/Madrid") — Intl.DateTimeFormat throws at request time otherwise,
  // which is a much worse failure mode than rejecting it here.
  const tz = parsed.data.config?.timezone;
  if (
    parsed.data.provider === "google_calendar" &&
    typeof tz === "string" &&
    tz.length > 0 &&
    !isValidIanaTimezone(tz)
  ) {
    return NextResponse.json(
      {
        error: `Zona horaria inválida: "${tz}". Usa un identificador IANA, ej: Europe/Madrid, America/Mexico_City.`,
      },
      { status: 400 },
    );
  }

  // Airtable's base id always starts with "app" — catches a pasted table/view
  // URL or record id before it ever reaches the sync job.
  const baseId = parsed.data.config?.base_id;
  if (
    parsed.data.provider === "airtable" &&
    typeof baseId === "string" &&
    baseId.length > 0 &&
    !/^app[a-zA-Z0-9]+$/.test(baseId)
  ) {
    return NextResponse.json(
      {
        error: `Base ID inválido: "${baseId}". Debe empezar con "app" (Airtable → base → Ayuda → API docs).`,
      },
      { status: 400 },
    );
  }

  // Zoom's host must be a real email — a Server-to-Server app can only host
  // meetings as a user that belongs to the platform's own Zoom account.
  // Trimmed first: a stray leading/trailing space (easy to pick up on paste)
  // otherwise fails the format check even for a perfectly valid address.
  if (parsed.data.provider === "zoom" && typeof parsed.data.config?.host_email === "string") {
    parsed.data.config.host_email = parsed.data.config.host_email.trim();
  }
  const hostEmail = parsed.data.config?.host_email;
  if (
    parsed.data.provider === "zoom" &&
    typeof hostEmail === "string" &&
    hostEmail.length > 0 &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hostEmail)
  ) {
    return NextResponse.json(
      { error: `Email inválido: "${hostEmail}".` },
      { status: 400 },
    );
  }

  const svc = svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Load existing to merge (don't overwrite masked values)
  const { data: existing } = await svc
    .from("integrations")
    .select("credentials, config, oauth_tokens")
    .eq("workspace_id", workspaceId)
    .eq("provider", parsed.data.provider)
    .single();

  // Filter out masked placeholder values from credentials update
  const newCreds = Object.fromEntries(
    Object.entries(parsed.data.credentials ?? {}).filter(
      ([, v]) => v !== "••••••" && v !== "",
    ),
  );
  // Decrypt the stored credentials before merging so the merge always
  // operates on plaintext; the whole thing gets re-encrypted before upsert.
  const existingCredsPlain = await decryptCredentials(
    existing?.credentials as Record<string, unknown> | null,
  );
  const mergedCreds: Record<string, unknown> = {
    ...existingCredsPlain,
    ...newCreds,
  };

  // For HighLevel, auto-generate a stable inbound-webhook token on first save.
  // Never overwrite an existing secret (so the configured URL stays valid).
  if (
    parsed.data.provider === "highlevel" &&
    typeof mergedCreds.highlevel_webhook_secret !== "string"
  ) {
    mergedCreds.highlevel_webhook_secret = randomBytes(24).toString("hex");
  }
  // Same pattern for Telegram's webhook secret (verified via the
  // X-Telegram-Bot-Api-Secret-Token header, Telegram's native equivalent of
  // HighLevel/YCloud's own signing-secret mechanisms) — never overwrite an
  // existing one so a previously-registered webhook stays valid.
  if (
    parsed.data.provider === "telegram" &&
    typeof mergedCreds.telegram_webhook_secret !== "string"
  ) {
    mergedCreds.telegram_webhook_secret = randomBytes(24).toString("hex");
  }
  const mergedCredsEncrypted = await encryptCredentials(mergedCreds);
  const mergedConfig: Record<string, unknown> = {
    ...((existing?.config as object) ?? {}),
    ...(parsed.data.config ?? {}),
  };

  // Register (or re-register) the Telegram webhook whenever a bot token is
  // present — requires a public HTTPS APP_URL; on localhost this call
  // predictably fails and the resulting status is surfaced to the admin
  // rather than silently ignored.
  if (parsed.data.provider === "telegram" && typeof mergedCreds.telegram_bot_token === "string" && mergedCreds.telegram_bot_token) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const webhookUrl = `${appUrl}/api/webhooks/telegram?wsid=${workspaceId}`;
    const result = await setTelegramWebhook(
      mergedCreds.telegram_bot_token,
      webhookUrl,
      mergedCreds.telegram_webhook_secret as string,
    );
    mergedConfig.telegram_webhook_status = result.ok ? "registered" : "error";
    mergedConfig.telegram_webhook_detail = result.ok ? null : result.description;
  }

  const { error } = await svc.from("integrations").upsert(
    {
      workspace_id: workspaceId,
      provider: parsed.data.provider,
      enabled: parsed.data.enabled ?? true,
      credentials: mergedCredsEncrypted,
      config: mergedConfig,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,provider" },
  );

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit — record which fields changed, never the secret values themselves.
  const changedCredFields = Object.keys(newCreds);
  const changedConfigFields = Object.keys(parsed.data.config ?? {});
  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: "integration.update",
    targetType: "integration",
    targetId: parsed.data.provider,
    summary: `Actualizó la integración de ${parsed.data.provider}`,
    metadata: {
      provider: parsed.data.provider,
      credentialFieldsChanged: changedCredFields,
      configFieldsChanged: changedConfigFields,
      enabled: parsed.data.enabled ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
