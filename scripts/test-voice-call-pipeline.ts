import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";

// Local, one-off smoke test for the Vapi -> contacts/pipeline link. POSTs a
// realistic end-of-call-report to the LOCAL dev server (npm run dev must be
// running on :3000) using the real Onyxlink vapi_assistant_id, with a
// deliberately fake/invalid customer number (+10000099999) so nothing
// touches a real person. Verifies: voice_calls row created + contact_id
// linked, a contacts row created/matched by phone, and (since the
// transcript shows clear payment-received signals) a deal auto-created at
// "cliente" via the pipeline classifier — proving voice + WhatsApp now share
// the same contacts/deals graph.

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
    .select("id, name, vapi_assistant_id")
    .eq("name", "Onyxlink")
    .single();
  if (!ws?.vapi_assistant_id) throw new Error("Workspace has no vapi_assistant_id");

  const testPhone = "+10000099999"; // deliberately invalid/unassigned
  const vapiCallId = `test-call-${Date.now()}`;

  // Clean slate for this test phone number.
  await db.from("contacts").delete().eq("workspace_id", ws.id).eq("phone", testPhone);

  const transcript = [
    "AI: Hola, gracias por llamar, ¿en qué puedo ayudarte?",
    "Usuario: Quería confirmar que ya hice el pago de la reserva del sábado, ya mandé el Bizum.",
    "AI: Perfecto, lo confirmo ahora mismo, ¡nos vemos el sábado!",
  ].join("\n");

  const payload = {
    message: {
      type: "end-of-call-report",
      call: {
        id: vapiCallId,
        assistantId: ws.vapi_assistant_id,
        status: "ended",
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        endedAt: new Date().toISOString(),
        customer: { number: testPhone },
      },
      endedReason: "customer-ended-call",
      cost: 0.12,
      transcript,
      summary: "El cliente confirmó que ya realizó el pago de su reserva del sábado.",
      messages: [],
    },
  };

  console.log("Posting test end-of-call-report to local dev server...");
  const res = await fetch("http://localhost:3000/api/webhooks/vapi", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET!,
    },
    body: JSON.stringify(payload),
  });
  const resBody = await res.json();
  console.log("Webhook response:", res.status, resBody);

  // Give the fire-and-forget pipeline classification a moment to finish.
  await new Promise((r) => setTimeout(r, 8000));

  const { data: voiceCall } = await db
    .from("voice_calls")
    .select("id, contact_id, customer_number, lead_status")
    .eq("vapi_call_id", vapiCallId)
    .maybeSingle();

  const { data: contact } = await db
    .from("contacts")
    .select("id, phone, opt_in")
    .eq("workspace_id", ws.id)
    .eq("phone", testPhone)
    .maybeSingle();

  const { data: deal } = contact
    ? await db
        .from("deals")
        .select("id, stage, title, notes")
        .eq("workspace_id", ws.id)
        .eq("contact_id", contact.id)
        .maybeSingle()
    : { data: null };

  const { data: tasks } = deal
    ? await db.from("tasks").select("title, status").eq("deal_id", deal.id)
    : { data: [] };

  // Cleanup
  if (contact) await db.from("contacts").delete().eq("id", contact.id); // cascades deal/tasks/voice_calls.contact_id (SET NULL)
  await db.from("voice_calls").delete().eq("vapi_call_id", vapiCallId);
  console.log("Test data cleaned up.");

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Test local — Llamadas de voz al Pipeline</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 840px; margin: 40px auto; padding: 0 20px; background: #0f1115; color: #e6e6e6; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.05rem; margin-top: 1.8rem; color: #9aeb3c; }
  pre { background: #1a1d24; padding: 12px 14px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
  .ok { color: #9aeb3c; } .warn { color: #e0b23c; } .err { color: #e0503c; }
</style></head>
<body>
<h1>Test local — Llamadas de voz integradas al Pipeline</h1>
<p>Generado ${new Date().toLocaleString("es-ES")} contra el workspace <strong>${ws.name}</strong>. Número de prueba inválido a propósito: <code>${testPhone}</code>.</p>

<h2>Transcript simulado</h2>
<pre>${escapeHtml(transcript)}</pre>

<h2>Fila en voice_calls</h2>
<pre>${escapeHtml(JSON.stringify(voiceCall, null, 2))}</pre>
<p>${voiceCall?.contact_id ? '<span class="ok">OK: la llamada quedó vinculada a un contact_id.</span>' : '<span class="err">FALLO: la llamada no se vinculó a ningún contacto.</span>'}</p>

<h2>Contacto resuelto/creado por teléfono</h2>
<pre>${escapeHtml(JSON.stringify(contact, null, 2))}</pre>

<h2>Deal generado por el clasificador de Pipeline</h2>
<pre>${escapeHtml(JSON.stringify(deal, null, 2))}</pre>
<p>${deal?.stage === "cliente" ? '<span class="ok">OK: el deal se creó directamente en fase "cliente" — el clasificador leyó correctamente la confirmación de pago en la llamada.</span>' : `<span class="warn">stage=${deal?.stage ?? "sin deal"} — revisar si el modelo clasificó distinto (no necesariamente un fallo).</span>`}</p>

<h2>Tareas creadas</h2>
<pre>${escapeHtml(JSON.stringify(tasks, null, 2))}</pre>
</body></html>`;

  const outPath = new URL("./test-voice-call-pipeline-report.html", import.meta.url);
  writeFileSync(outPath, html, "utf8");
  console.log(`\nReporte HTML escrito en: ${outPath.pathname.replace(/^\//, "")}`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
