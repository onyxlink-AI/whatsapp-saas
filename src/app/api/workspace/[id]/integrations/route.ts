import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient as svcClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import { encryptCredentials, decryptCredentials } from "@/shared/lib/crypto";
import { isValidIanaTimezone } from "@/shared/lib/timezone";
import { logAudit } from "@/features/audit/services/audit-log";

const IntegrationSchema = z.object({
  provider: z.enum(["ycloud", "openrouter", "highlevel", "google_calendar"]),
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
      // authorizes inbound contact-sync), so expose it unmasked (decrypted)
      // plus a prebuilt URL so the settings UI can render the webhook endpoint.
      if (row.provider === "highlevel") {
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
  const mergedCredsEncrypted = await encryptCredentials(mergedCreds);
  const mergedConfig = {
    ...((existing?.config as object) ?? {}),
    ...(parsed.data.config ?? {}),
  };

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
