import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { extractContactMemory } from "../src/features/inbox/services/memory-extraction";
import {
  getContactMemory,
  formatMemoryContext,
} from "../src/features/inbox/services/contact-memory";
import {
  searchContactMemories,
  formatMemoryItemsContext,
} from "../src/features/inbox/services/contact-memory-items";
import type { ConversationTurn } from "../src/features/inbox/services/conversation-history";

// Local, one-off smoke test for Memoria Inteligente Avanzada (Fase 1 + Fase 3).
// Runs the real extractContactMemory() + getContactMemory() +
// searchContactMemories() against the linked Supabase project (there is no
// staging env), using a throwaway test contact that gets deleted at the end.
// Writes a local HTML report so the result can be reviewed in a browser
// before deploying to Vercel.

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
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function main() {
  const db = svc();

  const { data: ws, error: wsError } = await db
    .from("workspaces")
    .select("id, name, advanced_memory_enabled")
    .eq("name", "Onyxlink")
    .single();
  if (wsError || !ws) throw new Error(`Workspace not found: ${wsError?.message}`);
  console.log(`Workspace: ${ws.name} (advanced_memory_enabled=${ws.advanced_memory_enabled})`);

  const testPhone = "TEST-MEMORIA-000";
  const { data: contact, error: contactError } = await db
    .from("contacts")
    .upsert(
      { workspace_id: ws.id, phone: testPhone, name: "TEST Memoria (borrar)" },
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

  // Deliberately includes a fake card number to verify the sensitive-data
  // safety net drops it instead of persisting it.
  const history: ConversationTurn[] = [
    {
      role: "user",
      content:
        "Hola, soy dueño de una tienda de ropa en Málaga y busco automatizar WhatsApp",
    },
    { role: "assistant", content: "¡Genial! Cuéntame más sobre tu negocio." },
    {
      role: "user",
      content:
        "Tenemos unos 200 mensajes al día, el problema es que no damos abasto por las tardes. Mi principal objeción es el precio, me parece caro.",
    },
  ];
  const mergedText =
    "Ah y una cosa, mi tarjeta es 4111 1111 1111 1111, apúntala por si acaso. " +
    "Por cierto, mejor no me llames por la mañana, suelo estar en el almacén sin cobertura hasta las 14h. " +
    "Y mi hermano tiene una tienda parecida en Sevilla, él fue quien me habló de vosotros.";
  const replyText =
    "Entiendo, vamos a ver cómo Onyxlink puede ayudarte a automatizar esas conversaciones de la tarde. Sobre el precio, lo mejor es agendar una llamada con un especialista.";

  console.log("Running extractContactMemory()...");
  await extractContactMemory({
    workspaceId: ws.id,
    conversationId: conversation.id,
    contactId: contact.id,
    history,
    mergedText,
    replyText,
  });

  const memory = await getContactMemory(contact.id);
  const promptBlock = formatMemoryContext(memory);

  const { data: memoryItems } = await db
    .from("contact_memory_items")
    .select("content, category, created_at")
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false });

  // Fase 3: search recuerdos with a follow-up-style query, simulating the
  // NEXT message in this conversation — should surface the tarde/objeción
  // items via semantic similarity, not exact keyword match.
  const followUpQuery = "¿A qué hora del día te viene mejor que te contacte?";
  console.log("Running searchContactMemories()...");
  const searchResults = await searchContactMemories(
    ws.id,
    contact.id,
    followUpQuery,
    5,
  );
  const memoryItemsBlock = formatMemoryItemsContext(searchResults);

  const { data: events } = await db
    .from("events")
    .select("type, level, payload, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false });

  // Cleanup: delete the throwaway contact (cascades conversation + contact_memories).
  await db.from("contacts").delete().eq("id", contact.id);
  console.log("Test contact cleaned up.");

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Test local — Memoria Inteligente Avanzada</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 840px; margin: 40px auto; padding: 0 20px; background: #0f1115; color: #e6e6e6; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; color: #9aeb3c; }
  pre { background: #1a1d24; padding: 14px 16px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
  .turn { padding: 8px 12px; margin: 4px 0; border-radius: 6px; }
  .turn.user { background: #1e2530; } .turn.assistant { background: #24261e; }
  .ok { color: #9aeb3c; } .warn { color: #e0b23c; } .err { color: #e0503c; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  td, th { border: 1px solid #333; padding: 6px 10px; text-align: left; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>Test local — Memoria Inteligente Avanzada (Fase 1 + Fase 3)</h1>
<p>Generado ${new Date().toLocaleString("es-ES")} contra el workspace <strong>${escapeHtml(ws.name)}</strong> (advanced_memory_enabled = ${ws.advanced_memory_enabled}).</p>
<p class="warn">Contacto de prueba creado y eliminado automáticamente al terminar — no queda dato de prueba en producción.</p>

<h2>1. Transcripción simulada (incluye un número de tarjeta falso a propósito)</h2>
${history.map((t) => `<div class="turn ${t.role}"><strong>${t.role}:</strong> ${escapeHtml(t.content)}</div>`).join("\n")}
<div class="turn user"><strong>user:</strong> ${escapeHtml(mergedText)}</div>
<div class="turn assistant"><strong>assistant:</strong> ${escapeHtml(replyText)}</div>

<h2>2. Memoria extraída y guardada en contact_memories</h2>
<pre>${escapeHtml(JSON.stringify(memory, null, 2))}</pre>

<h2>3. Bloque que se inyectaría en el prompt del agente</h2>
<pre class="ok">${escapeHtml(promptBlock || "(vacío — no se generó memoria)")}</pre>

<h2>4. Verificación de la red de seguridad (dato sensible)</h2>
<p>${
    JSON.stringify(memory).includes("4111") ||
    JSON.stringify(memoryItems).includes("4111")
      ? '<span class="err">FALLO: el número de tarjeta apareció en la memoria guardada.</span>'
      : '<span class="ok">OK: el número de tarjeta NO aparece en la memoria ni en los recuerdos.</span>'
  }</p>

<h2>5. Recuerdos individuales creados (contact_memory_items, Fase 3)</h2>
<pre>${escapeHtml(JSON.stringify(memoryItems, null, 2))}</pre>

<h2>6. Búsqueda semántica — consulta de seguimiento simulada</h2>
<p>Consulta: <em>"${escapeHtml(followUpQuery)}"</em></p>
<pre>${escapeHtml(JSON.stringify(searchResults, null, 2))}</pre>

<h2>7. Bloque "Recuerdos relevantes" que se inyectaría en el prompt</h2>
<pre class="ok">${escapeHtml(memoryItemsBlock || "(vacío — no se encontraron recuerdos relevantes)")}</pre>

<h2>8. Eventos registrados (tabla events)</h2>
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

  const outPath = new URL("./test-advanced-memory-report.html", import.meta.url);
  writeFileSync(outPath, html, "utf8");
  console.log(`\nReporte HTML escrito en: ${outPath.pathname.replace(/^\//, "")}`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
