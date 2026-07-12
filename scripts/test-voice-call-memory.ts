import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { formatMemoryContext } from "../src/features/inbox/services/contact-memory";
import { formatMemoryItemsContext, searchContactMemories } from "../src/features/inbox/services/contact-memory-items";

// Local, one-off smoke test proving cross-channel memory: a voice call
// (simulated end-of-call-report posted to the local dev server, fake phone
// number so nothing touches a real person) should populate contact_memories
// / contact_memory_items for the resolved contact, exactly like a WhatsApp
// conversation would — meaning the NEXT time this contact WhatsApps, the
// agent's prompt would already include what was said on the call.

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

  const testPhone = "+10000088888"; // deliberately invalid/unassigned
  const vapiCallId = `test-memory-call-${Date.now()}`;

  await db.from("contacts").delete().eq("workspace_id", ws.id).eq("phone", testPhone);

  const transcript = [
    "AI: Hola, gracias por llamar, ¿en qué puedo ayudarte?",
    "Usuario: Hola, soy Elena. Llamo porque tengo alergia a los mariscos y quería confirmar que el menú de la reserva del viernes no lleva marisco.",
    "AI: Claro Elena, lo anoto y confirmamos que tu menú será sin marisco por tu alergia.",
  ].join("\n");

  const payload = {
    message: {
      type: "end-of-call-report",
      call: {
        id: vapiCallId,
        assistantId: ws.vapi_assistant_id,
        status: "ended",
        startedAt: new Date(Date.now() - 90_000).toISOString(),
        endedAt: new Date().toISOString(),
        customer: { number: testPhone },
      },
      endedReason: "customer-ended-call",
      cost: 0.1,
      transcript,
      summary: "Elena llamó para confirmar que su menú del viernes sea sin marisco por alergia.",
      messages: [],
    },
  };

  console.log("Posting test end-of-call-report to local dev server...");
  const res = await fetch("http://localhost:3005/api/webhooks/vapi", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET!,
    },
    body: JSON.stringify(payload),
  });
  console.log("Webhook response:", res.status, await res.json());

  console.log("Waiting for fire-and-forget memory extraction + pipeline classification...");
  await new Promise((r) => setTimeout(r, 10000));

  const { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("workspace_id", ws.id)
    .eq("phone", testPhone)
    .maybeSingle();

  const { data: memory } = contact
    ? await db.from("contact_memories").select("*").eq("contact_id", contact.id).maybeSingle()
    : { data: null };

  const { data: items } = contact
    ? await db.from("contact_memory_items").select("content, category").eq("contact_id", contact.id)
    : { data: [] };

  // Simulate the NEXT WhatsApp message from this same contact, asking about
  // the reservation — this is exactly what buffer.ts does for a real message.
  let promptBlock = "";
  let itemsBlock = "";
  if (contact) {
    promptBlock = formatMemoryContext(memory as never);
    const searchResults = await searchContactMemories(
      ws.id,
      contact.id,
      "¿A qué hora es mi reserva del viernes?",
      5,
    );
    itemsBlock = formatMemoryItemsContext(searchResults);
  }

  // Cleanup
  if (contact) await db.from("contacts").delete().eq("id", contact.id);
  await db.from("voice_calls").delete().eq("vapi_call_id", vapiCallId);
  console.log("Test data cleaned up.");

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Test local — Memoria compartida voz/WhatsApp</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 840px; margin: 40px auto; padding: 0 20px; background: #0f1115; color: #e6e6e6; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.05rem; margin-top: 1.8rem; color: #9aeb3c; }
  pre { background: #1a1d24; padding: 12px 14px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
  .ok { color: #9aeb3c; } .warn { color: #e0b23c; } .err { color: #e0503c; }
</style></head>
<body>
<h1>Test local — Memoria compartida entre llamada de voz y WhatsApp</h1>
<p>Generado ${new Date().toLocaleString("es-ES")} contra el workspace <strong>${ws.name}</strong>. Número de prueba inválido a propósito: <code>${testPhone}</code>.</p>

<h2>Transcript de la llamada simulada</h2>
<pre>${escapeHtml(transcript)}</pre>

<h2>contact_memories generado a partir de la llamada</h2>
<pre>${escapeHtml(JSON.stringify(memory, null, 2))}</pre>
<p>${memory ? '<span class="ok">OK: la llamada generó memoria estructurada para el contacto.</span>' : '<span class="err">FALLO: no se generó memoria.</span>'}</p>

<h2>contact_memory_items (recuerdos individuales) generados</h2>
<pre>${escapeHtml(JSON.stringify(items, null, 2))}</pre>

<h2>Simulación: el contacto ahora escribe por WhatsApp preguntando por su reserva</h2>
<p>Bloque "Memoria del contacto" que se inyectaría en el prompt del agente de WhatsApp:</p>
<pre class="ok">${escapeHtml(promptBlock || "(vacío)")}</pre>
<p>Bloque "Recuerdos relevantes" (búsqueda semántica con la pregunta "¿A qué hora es mi reserva del viernes?"):</p>
<pre class="ok">${escapeHtml(itemsBlock || "(vacío)")}</pre>
<p>${
    /marisco|alergia/i.test(promptBlock + itemsBlock)
      ? '<span class="ok">OK: el agente de WhatsApp vería la alergia a mariscos mencionada SOLO por teléfono — la conexión entre canales funciona.</span>'
      : '<span class="warn">No se encontró la mención de la alergia en el contexto que vería WhatsApp — revisar.</span>'
  }</p>
</body></html>`;

  const outPath = new URL("./test-voice-call-memory-report.html", import.meta.url);
  writeFileSync(outPath, html, "utf8");
  console.log(`\nReporte HTML escrito en: ${outPath.pathname.replace(/^\//, "")}`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
