import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { sendDueReminders } from "../src/features/inbox/services/appointment-reminders";

// Local, one-off smoke test for the appointment-reminders cron logic. Uses a
// throwaway fake-"approved" template (never touches real Meta approval, same
// technique as prior tests) and a test appointment 1h from now with an
// invalid/unassigned phone number (+10000000000) so nothing can ever reach a
// real person. Also checks an appointment OUTSIDE the 2h window is correctly
// left alone.

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
  const { data: ws } = await db.from("workspaces").select("id, name").eq("name", "Onyxlink").single();
  if (!ws) throw new Error("Workspace not found");

  const testPhone = "+10000000000"; // deliberately invalid/unassigned
  const { data: contact, error: contactError } = await db
    .from("contacts")
    .upsert(
      { workspace_id: ws.id, phone: testPhone, name: "TEST Recordatorio (borrar)", opt_in: true },
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

  await db.from("appointments").delete().eq("workspace_id", ws.id).eq("contact_id", contact.id);

  const dueIn1h = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const dueIn5h = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

  const { data: dueAppt, error: dueApptError } = await db
    .from("appointments")
    .insert({
      workspace_id: ws.id,
      contact_id: contact.id,
      conversation_id: conversation.id,
      scheduled_at: dueIn1h,
      status: "booked",
    })
    .select("id")
    .single();
  if (dueApptError || !dueAppt) throw new Error(`Due appt insert failed: ${dueApptError?.message}`);

  const { data: farAppt, error: farApptError } = await db
    .from("appointments")
    .insert({
      workspace_id: ws.id,
      contact_id: contact.id,
      conversation_id: conversation.id,
      scheduled_at: dueIn5h,
      status: "booked",
    })
    .select("id")
    .single();
  if (farApptError || !farAppt) throw new Error(`Far appt insert failed: ${farApptError?.message}`);

  // Throwaway fake-approved template (never touches real Meta approval).
  const { data: fakeTemplate, error: tplError } = await db
    .from("templates")
    .insert({
      workspace_id: ws.id,
      name: "test_fake_recordatorio",
      language: "es",
      category: "utility",
      status: "approved",
      body_template: "Hola {{1}}, este es un recordatorio: tienes una cita programada hoy a las {{2}}. ¡Te esperamos!",
      components: {},
      variables: [
        { index: 1, example: "Juan" },
        { index: 2, example: "16:00" },
      ],
    })
    .select("id")
    .single();
  if (tplError || !fakeTemplate) throw new Error(`Fake template insert failed: ${tplError?.message}`);

  console.log("Running sendDueReminders()...");
  const result = await sendDueReminders();
  console.log("Result:", result);

  const { data: apptsAfter } = await db
    .from("appointments")
    .select("id, scheduled_at, reminder_sent_at")
    .in("id", [dueAppt.id, farAppt.id]);

  const { data: events } = await db
    .from("events")
    .select("type, level, payload, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false });

  // Cleanup
  await db.from("templates").delete().eq("id", fakeTemplate.id);
  await db.from("contacts").delete().eq("id", contact.id); // cascades appointments + conversation
  console.log("Test data cleaned up.");

  const dueApptAfter = apptsAfter?.find((a) => a.id === dueAppt.id);
  const farApptAfter = apptsAfter?.find((a) => a.id === farAppt.id);

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Test local — Recordatorios de citas</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 840px; margin: 40px auto; padding: 0 20px; background: #0f1115; color: #e6e6e6; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.05rem; margin-top: 1.8rem; color: #9aeb3c; }
  pre { background: #1a1d24; padding: 12px 14px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
  .ok { color: #9aeb3c; } .warn { color: #e0b23c; } .err { color: #e0503c; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  td, th { border: 1px solid #333; padding: 6px 10px; text-align: left; font-size: 0.85rem; }
</style></head>
<body>
<h1>Test local — Recordatorios de citas (2h antes)</h1>
<p>Generado ${new Date().toLocaleString("es-ES")} contra el workspace <strong>${ws.name}</strong>.</p>

<h2>Resultado de sendDueReminders()</h2>
<pre>${JSON.stringify(result, null, 2)}</pre>

<h2>Cita dentro de la ventana de 2h (esperado: reminder_sent_at con valor)</h2>
<pre>${JSON.stringify(dueApptAfter, null, 2)}</pre>
<p>${dueApptAfter?.reminder_sent_at ? '<span class="ok">OK: se marcó como enviado.</span>' : '<span class="warn">No se marcó — revisar el intento de envío en events (probablemente falló en YCloud por el número inválido, lo cual es esperado y seguro).</span>'}</p>

<h2>Cita fuera de la ventana de 2h — 5h en el futuro (esperado: reminder_sent_at vacío, no se tocó)</h2>
<pre>${JSON.stringify(farApptAfter, null, 2)}</pre>
<p>${!farApptAfter?.reminder_sent_at ? '<span class="ok">OK: la cita lejana no fue tocada.</span>' : '<span class="err">FALLO: se envió un recordatorio para una cita fuera de ventana.</span>'}</p>

<h2>Eventos registrados</h2>
<table><tr><th>Tipo</th><th>Nivel</th><th>Payload</th><th>Fecha</th></tr>
${(events ?? []).map((e) => `<tr><td>${e.type}</td><td>${e.level}</td><td><pre>${JSON.stringify(e.payload)}</pre></td><td>${e.created_at}</td></tr>`).join("\n")}
</table>
</body></html>`;

  const outPath = new URL("./test-appointment-reminders-report.html", import.meta.url);
  writeFileSync(outPath, html, "utf8");
  console.log(`\nReporte HTML escrito en: ${outPath.pathname.replace(/^\//, "")}`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
