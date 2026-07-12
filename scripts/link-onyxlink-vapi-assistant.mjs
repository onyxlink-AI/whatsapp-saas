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

const { data: found, error: findErr } = await svc
  .from("workspaces")
  .select("id, name, slug, vapi_assistant_id")
  .ilike("name", "%onyxlink%");

console.log("Matching workspaces:", JSON.stringify(found, null, 2), findErr);

if (!found || found.length !== 1) {
  console.log("Aborting: expected exactly one match, review manually.");
  process.exit(1);
}

const ws = found[0];
const assistantId = "4ca5c330-4093-4be0-a787-c2eb05f478f3";

const { data: updated, error: updErr } = await svc
  .from("workspaces")
  .update({ vapi_assistant_id: assistantId })
  .eq("id", ws.id)
  .select("id, name, vapi_assistant_id")
  .single();

console.log("Updated:", JSON.stringify(updated, null, 2), updErr);
