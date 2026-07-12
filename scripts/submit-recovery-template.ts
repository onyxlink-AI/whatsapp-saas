import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolveWabaId, createYCloudTemplate } from "../src/features/inbox/services/ycloud-client";
import { buildYCloudPayload, type CreateTemplateInput } from "../src/features/settings/lib/template-form";
import { decryptCredentials } from "../src/shared/lib/crypto";

// One-off: creates the "Seguimiento de interés" template (from the system
// template_library) as a draft for the Onyxlink workspace and submits it to
// YCloud/Meta for approval. Needed because Recuperación de Leads Fríos con IA
// has nothing to send without at least one approved marketing template.

for (const line of readFileSync(
  new URL("../.env.local", import.meta.url),
  "utf8",
).split("\n")) {
  if (!line.includes("=") || line.trim().startsWith("#")) continue;
  const idx = line.indexOf("=");
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (key) process.env[key] = value;
}

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function main() {
  const db = svc();

  const { data: ws } = await db
    .from("workspaces")
    .select("id, name")
    .eq("name", "Onyxlink")
    .single();
  if (!ws) throw new Error("Workspace not found");

  const templateInput: CreateTemplateInput = {
    name: "seguimiento_de_interes",
    category: "marketing",
    header_type: "none",
    header_text: "",
    body_template:
      "Hola {{1}}, ¿seguimos con tu interés en {{2}}? Con gusto te ayudo a agendar una cita sin compromiso.",
    body_variables: [
      { index: 1, example: "Juan" },
      { index: 2, example: "automatizar WhatsApp" },
    ],
    footer_text: "",
    buttons: [],
  };

  // 1. Insert the draft row (skip if it already exists for this workspace).
  const { data: existing } = await db
    .from("templates")
    .select("id, status")
    .eq("workspace_id", ws.id)
    .eq("name", templateInput.name)
    .eq("language", "es")
    .maybeSingle();

  let templateId: string;
  if (existing) {
    console.log(`Template ya existe (status=${existing.status}), reutilizando.`);
    templateId = existing.id;
    if (existing.status !== "draft" && existing.status !== "rejected") {
      console.log("No está en draft/rejected — nada que enviar. Saliendo.");
      return;
    }
  } else {
    const { data: inserted, error: insertError } = await db
      .from("templates")
      .insert({
        workspace_id: ws.id,
        name: templateInput.name,
        language: "es",
        category: templateInput.category,
        body_template: templateInput.body_template,
        components: {},
        header_type: templateInput.header_type,
        header_text: templateInput.header_text,
        footer_text: templateInput.footer_text,
        buttons: templateInput.buttons,
        variables: templateInput.body_variables,
        status: "draft",
      })
      .select("id")
      .single();
    if (insertError || !inserted) throw new Error(`Insert failed: ${insertError?.message}`);
    templateId = inserted.id;
    console.log("Draft creado:", templateId);
  }

  // 2. Load YCloud credentials + phone number.
  const { data: integration } = await db
    .from("integrations")
    .select("credentials, config")
    .eq("workspace_id", ws.id)
    .eq("provider", "ycloud")
    .eq("enabled", true)
    .maybeSingle();

  const credentials = await decryptCredentials(
    integration?.credentials as Record<string, unknown> | null,
  );
  const apiKey = (credentials.ycloud_api_key as string) ?? "";
  const phoneNumber =
    ((integration?.config as Record<string, unknown> | null)?.phone_number as
      | string
      | undefined) ?? "";

  if (!apiKey || apiKey === "placeholder") throw new Error("No YCloud API key configured");
  if (!phoneNumber) throw new Error("No phone_number configured");

  // 3. Resolve wabaId + submit to YCloud/Meta.
  console.log("Resolviendo wabaId...");
  const wabaId = await resolveWabaId(apiKey, phoneNumber);
  console.log("wabaId:", wabaId);

  const payload = buildYCloudPayload(wabaId, templateInput);
  console.log("Enviando plantilla a YCloud/Meta para aprobación...");
  const result = await createYCloudTemplate(apiKey, payload);
  console.log("Resultado YCloud:", result);

  await db
    .from("templates")
    .update({
      status: "submitted",
      provider_template_id: result.id || null,
      rejection_reason: null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId);

  console.log(
    `\nPlantilla "${templateInput.name}" enviada a aprobación (status=submitted). Meta puede tardar horas/días en aprobarla — revisa el estado en Settings → Templates.`,
  );
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
