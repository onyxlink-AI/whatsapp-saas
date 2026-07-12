// One-off: existing voice_calls rows saved before the phone-fallback fix
// have customer_number=null (web/dashboard test calls have no Caller ID),
// so they were never linked to a contact and never reached Pipeline AI
// classification. Re-derive the phone from each row's own raw_payload
// (same logic as the now-fixed webhook) and run the same linking/
// classification steps the webhook would have run.
import { createClient } from "@supabase/supabase-js";
import {
  normalizePhone,
  DEFAULT_COUNTRY_CODE,
} from "../src/features/inbox/services/normalizer";
import {
  isPipelineAiEnabled,
  runPipelineClassification,
} from "../src/features/pipeline/services/pipeline-suggestion";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface ToolCallMsg {
  toolCalls?: { function?: { name?: string; arguments?: string } }[];
}

function extractSavedLeadFields(messages: ToolCallMsg[] | undefined): Record<string, unknown> | null {
  if (!Array.isArray(messages)) return null;
  let lastFields: Record<string, unknown> | null = null;
  for (const m of messages) {
    if (!Array.isArray(m.toolCalls)) continue;
    for (const tc of m.toolCalls) {
      if (tc.function?.name !== "save_lead") continue;
      try {
        const parsed = JSON.parse(tc.function.arguments ?? "{}") as { fields?: Record<string, unknown> };
        if (parsed.fields) lastFields = parsed.fields;
      } catch {
        // skip malformed
      }
    }
  }
  return lastFields;
}

async function main() {
  const { data: rows, error } = await svc
    .from("voice_calls")
    .select("id, workspace_id, customer_number, contact_id, transcript, summary, raw_payload");
  if (error) throw error;

  for (const row of rows ?? []) {
    if (row.customer_number && row.contact_id) {
      console.log(row.id, "already linked, skipping");
      continue;
    }

    const msg = (row.raw_payload as { message?: Record<string, unknown> })?.message;
    const messages = (msg?.messages ?? (msg?.artifact as { messages?: unknown })?.messages) as
      | ToolCallMsg[]
      | undefined;
    const leadFields = extractSavedLeadFields(messages);
    const rawPhone = leadFields?.Teléfono;
    const phone =
      row.customer_number ?? (typeof rawPhone === "string" && rawPhone !== "unknown" ? rawPhone : null);

    if (!phone) {
      console.log(row.id, "no phone available in raw_payload, skipping");
      continue;
    }

    const { data: biRow } = await svc
      .from("business_info")
      .select("structured")
      .eq("workspace_id", row.workspace_id)
      .maybeSingle();
    const defaultCc =
      ((biRow?.structured as { default_country_code?: string } | null)?.default_country_code as string) ??
      DEFAULT_COUNTRY_CODE;
    const normalized = normalizePhone(phone, defaultCc);

    const { data: contact, error: contactErr } = await svc
      .from("contacts")
      .upsert(
        { workspace_id: row.workspace_id, phone: normalized, opt_in: true, opt_in_at: new Date().toISOString() },
        { onConflict: "workspace_id,phone", ignoreDuplicates: false },
      )
      .select("id")
      .single();

    if (contactErr || !contact) {
      console.error(row.id, "contact upsert failed:", contactErr?.message);
      continue;
    }

    await svc.from("voice_calls").update({ customer_number: phone, contact_id: contact.id }).eq("id", row.id);
    console.log(row.id, "-> linked to contact", contact.id, "phone", normalized);

    const callText = row.transcript ?? row.summary;
    if (callText && (await isPipelineAiEnabled(row.workspace_id))) {
      await runPipelineClassification({
        workspaceId: row.workspace_id,
        conversationId: null,
        contactId: contact.id,
        history: [],
        mergedText: callText,
        replyText: "",
      });
      console.log(row.id, "-> pipeline classification run");
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
