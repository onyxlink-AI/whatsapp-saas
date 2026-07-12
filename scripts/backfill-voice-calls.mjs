// One-off: re-derive cost + lead_status for existing voice_calls rows from
// their already-stored raw_payload, using the same logic as the (now fixed)
// webhook handler. Safe to re-run — idempotent.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function extractLeadStatus(messages) {
  if (!Array.isArray(messages)) return null;
  let lastEstado = null;
  for (const m of messages) {
    if (!Array.isArray(m.toolCalls)) continue;
    for (const tc of m.toolCalls) {
      if (tc.function?.name !== "save_lead") continue;
      try {
        const parsed = JSON.parse(tc.function.arguments ?? "{}");
        const estado = parsed?.fields?.Estado;
        if (typeof estado === "string") lastEstado = estado;
      } catch {
        // ignore malformed arguments
      }
    }
  }
  return lastEstado;
}

const { data: rows, error } = await svc.from("voice_calls").select("id, raw_payload");
if (error) {
  console.error(error);
  process.exit(1);
}

for (const row of rows) {
  const msg = row.raw_payload?.message;
  if (!msg) continue;
  const cost = msg.cost ?? msg.costBreakdown?.total ?? null;
  const leadStatus = extractLeadStatus(msg.messages ?? msg.artifact?.messages);
  const { error: updErr } = await svc
    .from("voice_calls")
    .update({ cost, lead_status: leadStatus })
    .eq("id", row.id);
  console.log(row.id, "-> cost:", cost, "lead_status:", leadStatus, updErr ?? "OK");
}
