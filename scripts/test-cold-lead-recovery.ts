import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { runColdLeadRecoveryForWorkspace } from "../src/features/inbox/services/cold-lead-recovery";

// Local, one-off smoke test for Recuperación de Leads Fríos con IA. Two runs:
//  1. Against the REAL current state (no approved template yet — Meta is
//     still reviewing "seguimiento_de_interes") to confirm the function
//     correctly skips with no_approved_template instead of erroring.
//  2. With a throwaway FAKE "approved" template row (never sent to Meta,
//     just marked approved locally) to exercise the full pipeline end to
//     end: candidate finding, LLM evaluation, template fill, and a dispatch
//     attempt against a deliberately invalid/unassigned phone number
//     (+10000000000) so nothing can ever reach a real person — YCloud will
//     reject it cleanly and that failure path gets verified too.

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main() {
  const db = svc();

  const { data: ws } = await db
    .from("workspaces")
    .select("id, name")
    .eq("name", "Onyxlink")
    .single();
  if (!ws) throw new Error("Workspace not found");

  // ── Run 1: real current state (no approved template) ──────────────────────
  console.log("Run 1: current real state (expect no_approved_template)...");
  const run1 = await runColdLeadRecoveryForWorkspace(ws.id);
  console.log("Run 1 result:", run1);

  // ── Set up: throwaway test contact, 5 days cold, opt_in, real interest ────
  const testPhone = "+10000000000"; // deliberately invalid/unassigned — cannot reach a real person
  const { data: contact, error: contactError } = await db
    .from("contacts")
    .upsert(
      {
        workspace_id: ws.id,
        phone: testPhone,
        name: "TEST Recuperación (borrar)",
        opt_in: true,
        stage: "engaged",
        custom_fields: {},
      },
      { onConflict: "workspace_id,phone" },
    )
    .select("id")
    .single();
  if (contactError || !contact) throw new Error(`Contact upsert failed: ${contactError?.message}`);

  const { data: conversation, error: convError } = await db
    .from("conversations")
    .upsert(
      { workspace_id: ws.id, contact_id: contact.id },
      { onConflict: "workspace_id,contact_id,channel" },
    )
    .select("id")
    .single();
  if (convError || !conversation) throw new Error(`Conversation upsert failed: ${convError?.message}`);

  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  await db
    .from("conversations")
    .update({ last_message_at: fiveDaysAgo })
    .eq("id", conversation.id);

  await db.from("messages").insert([
    {
      workspace_id: ws.id,
      conversation_id: conversation.id,
      direction: "in",
      type: "text",
      body: "Hola, tengo una clínica dental y me interesa mucho automatizar WhatsApp, ¿cuánto cuesta?",
      created_at: fiveDaysAgo,
    },
    {
      workspace_id: ws.id,
      conversation_id: conversation.id,
      direction: "out",
      type: "text",
      body: "Perfecto, lo mejor es agendar una llamada con un especialista para ver precios.",
      created_at: fiveDaysAgo,
    },
  ]);

  // ── Throwaway FAKE approved template (never touches real Meta approval) ───
  const { data: fakeTemplate, error: tplError } = await db
    .from("templates")
    .insert({
      workspace_id: ws.id,
      name: "test_fake_approved_recovery",
      language: "es",
      category: "marketing",
      status: "approved", // fabricated locally for this test only
      body_template:
        "Hola {{1}}, ¿seguimos con tu interés en {{2}}? Con gusto te ayudo a agendar una cita sin compromiso.",
      components: {},
      variables: [
        { index: 1, example: "Juan" },
        { index: 2, example: "automatizar WhatsApp" },
      ],
    })
    .select("id")
    .single();
  if (tplError || !fakeTemplate) throw new Error(`Fake template insert failed: ${tplError?.message}`);

  console.log("\nRun 2: full pipeline with a fake-approved template...");
  const run2 = await runColdLeadRecoveryForWorkspace(ws.id);
  console.log("Run 2 result:", run2);

  const { data: contactAfter } = await db
    .from("contacts")
    .select("custom_fields")
    .eq("id", contact.id)
    .single();

  const { data: events } = await db
    .from("events")
    .select("type, level, payload, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false });

  // Cleanup
  await db.from("templates").delete().eq("id", fakeTemplate.id);
  await db.from("contacts").delete().eq("id", contact.id); // cascades conversation + messages
  console.log("\nTest contact/template cleaned up.");

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Test local — Recuperación de Leads Fríos con IA</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 840px; margin: 40px auto; padding: 0 20px; background: #0f1115; color: #e6e6e6; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; color: #9aeb3c; }
  pre { background: #1a1d24; padding: 14px 16px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
  .ok { color: #9aeb3c; } .warn { color: #e0b23c; } .err { color: #e0503c; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  td, th { border: 1px solid #333; padding: 6px 10px; text-align: left; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>Test local — Recuperación de Leads Fríos con IA</h1>
<p>Generado ${new Date().toLocaleString("es-ES")} contra el workspace <strong>${escapeHtml(ws.name)}</strong>.</p>

<h2>Run 1 — estado real actual (sin plantilla aprobada todavía)</h2>
<pre>${escapeHtml(JSON.stringify(run1, null, 2))}</pre>
<p>${
    run1.skipped === "no_approved_template"
      ? '<span class="ok">OK: el sistema detectó correctamente que aún no hay plantilla aprobada por Meta y no intentó enviar nada.</span>'
      : `<span class="warn">skipped=${run1.skipped} — revisar si ya hay una plantilla aprobada real.</span>`
  }</p>

<h2>Run 2 — pipeline completo con plantilla aprobada de prueba (falsa, no tocó Meta)</h2>
<p>Contacto de prueba: teléfono <code>+10000000000</code> (inválido a propósito — no puede llegar a una persona real), 5 días sin respuesta, mensaje previo con interés claro.</p>
<pre>${escapeHtml(JSON.stringify(run2, null, 2))}</pre>
<p>${
    run2.evaluated > 0
      ? '<span class="ok">OK: el contacto de prueba fue evaluado por la IA.</span>'
      : '<span class="err">FALLO: el contacto de prueba no fue evaluado — revisar los filtros de findColdCandidates.</span>'
  }</p>

<h2>custom_fields del contacto tras la evaluación</h2>
<pre>${escapeHtml(JSON.stringify(contactAfter?.custom_fields ?? {}, null, 2))}</pre>

<h2>Eventos registrados (tabla events)</h2>
<table>
<tr><th>Tipo</th><th>Nivel</th><th>Payload</th><th>Fecha</th></tr>
${(events ?? [])
  .map(
    (e) =>
      `<tr><td>${escapeHtml(e.type)}</td><td>${escapeHtml(e.level)}</td><td><pre>${escapeHtml(JSON.stringify(e.payload))}</pre></td><td>${escapeHtml(e.created_at)}</td></tr>`,
  )
  .join("\n")}
</table>
</body>
</html>`;

  const outPath = new URL("./test-cold-lead-recovery-report.html", import.meta.url);
  writeFileSync(outPath, html, "utf8");
  console.log(`\nReporte HTML escrito en: ${outPath.pathname.replace(/^\//, "")}`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
