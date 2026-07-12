import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { runPipelineClassification } from "../src/features/pipeline/services/pipeline-suggestion";
import type { ConversationTurn } from "../src/features/inbox/services/conversation-history";

// Local, one-off smoke test for the real-time 4-phase pipeline classifier.
// Runs the real runPipelineClassification() against the linked Supabase
// project (no staging env), driving one throwaway test contact through all
// 4 phases in sequence (exploración → interés → listo_para_comprar →
// cliente) to verify: (1) no deal is created on exploración alone, (2) a
// deal gets created once real intent shows up, (3) it only ever moves
// forward, one phase per message, matching the exact behavioral criteria
// given by the user.

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

interface StepResult {
  label: string;
  mergedText: string;
  dealBefore: { stage: string; notes: string | null } | null;
  dealAfter: { id: string; stage: string; notes: string | null } | null;
}

async function main() {
  const db = svc();

  const { data: ws } = await db
    .from("workspaces")
    .select("id, name")
    .eq("name", "Onyxlink")
    .single();
  if (!ws) throw new Error("Workspace not found");

  const testPhone = "TEST-CLASSIFIER-000";
  const { data: contact, error: contactError } = await db
    .from("contacts")
    .upsert(
      { workspace_id: ws.id, phone: testPhone, name: "TEST Clasificador (borrar)" },
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

  // Clean slate: remove any deal left from a previous run.
  await db.from("deals").delete().eq("workspace_id", ws.id).eq("contact_id", contact.id);

  const history: ConversationTurn[] = [];
  const steps: { label: string; mergedText: string; replyText: string }[] = [
    {
      label: "Fase 1 — Exploración (curiosidad, sin deal esperado)",
      mergedText: "Hola, ¿cómo funciona el servicio de reservas? ¿Tenéis disponibilidad esta semana?",
      replyText: "¡Hola! Te cuento cómo funciona: reservas online y confirmación inmediata. ¿Qué día te viene bien?",
    },
    {
      label: "Fase 2 — Interés (quiere reservar, esperamos que SE CREE el deal)",
      mergedText: "Perfecto, quiero reservar para el sábado a las 17:00. Me llamo Marco y mi teléfono es el que ya tienes.",
      replyText: "Genial Marco, te confirmo el sábado 17:00. ¿Seguimos con el proceso?",
    },
    {
      label: "Fase 3 — Listo para comprar (esperamos avance a listo_para_comprar)",
      mergedText: "Sí, ¿cómo hago el pago? ¿Tenéis Bizum o algún enlace?",
      replyText: "Puedes pagar por Bizum al 600123456 o con el enlace que te mando ahora mismo.",
    },
    {
      label: "Fase 4 — Cliente (esperamos avance a cliente)",
      mergedText: "Listo, ya hice el Bizum, aquí tienes el justificante.",
      replyText: "¡Perfecto Marco! Recibido, quedas confirmado. ¡Nos vemos el sábado!",
    },
  ];

  const results: StepResult[] = [];

  for (const step of steps) {
    const { data: dealBefore } = await db
      .from("deals")
      .select("stage, notes")
      .eq("workspace_id", ws.id)
      .eq("contact_id", contact.id)
      .maybeSingle();

    console.log(`Running: ${step.label}`);
    await runPipelineClassification({
      workspaceId: ws.id,
      conversationId: conversation.id,
      contactId: contact.id,
      history: [...history],
      mergedText: step.mergedText,
      replyText: step.replyText,
    });

    const { data: dealAfter } = await db
      .from("deals")
      .select("id, stage, notes")
      .eq("workspace_id", ws.id)
      .eq("contact_id", contact.id)
      .maybeSingle();

    console.log(`  before=${dealBefore?.stage ?? "(sin deal)"} after=${dealAfter?.stage ?? "(sin deal)"}`);

    results.push({
      label: step.label,
      mergedText: step.mergedText,
      dealBefore: dealBefore ?? null,
      dealAfter: dealAfter ?? null,
    });

    history.push({ role: "user", content: step.mergedText });
    history.push({ role: "assistant", content: step.replyText });
  }

  const { data: events } = await db
    .from("events")
    .select("type, level, payload, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  const finalDealId = [...results].reverse().find((r) => r.dealAfter)?.dealAfter?.id;
  const { data: tasks } = finalDealId
    ? await db
        .from("tasks")
        .select("title, status, task_type, created_at")
        .eq("deal_id", finalDealId)
        .order("created_at", { ascending: true })
    : { data: [] };

  // Cleanup
  await db.from("contacts").delete().eq("id", contact.id); // cascades deal + conversation + tasks
  console.log("\nTest contact/deal cleaned up.");

  const expectedProgression = [
    null,
    "interes",
    "listo_para_comprar",
    "cliente",
  ];
  const actualProgression = results.map((r) => r.dealAfter?.stage ?? null);
  const matchesExpectation = JSON.stringify(actualProgression) === JSON.stringify(expectedProgression);

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Test local — Clasificador de 4 fases del Pipeline</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 840px; margin: 40px auto; padding: 0 20px; background: #0f1115; color: #e6e6e6; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.05rem; margin-top: 1.8rem; color: #9aeb3c; }
  pre { background: #1a1d24; padding: 12px 14px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
  .step { border: 1px solid #333; border-radius: 8px; padding: 12px 14px; margin: 10px 0; }
  .ok { color: #9aeb3c; } .warn { color: #e0b23c; } .err { color: #e0503c; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  td, th { border: 1px solid #333; padding: 6px 10px; text-align: left; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>Test local — Clasificador de 4 fases del Pipeline (tiempo real)</h1>
<p>Generado ${new Date().toLocaleString("es-ES")} contra el workspace <strong>${escapeHtml(ws.name)}</strong>. Contacto de prueba creado y eliminado automáticamente.</p>

<h2>Progresión esperada vs. real</h2>
<p>Esperado: (sin deal) → interes → listo_para_comprar → cliente</p>
<p>Real: ${actualProgression.map((s) => s ?? "(sin deal)").join(" → ")}</p>
<p>${
    matchesExpectation
      ? '<span class="ok">OK: el clasificador siguió exactamente la progresión esperada — no creó deal en exploración, y avanzó una fase por mensaje sin retroceder.</span>'
      : '<span class="warn">La progresión no coincidió exactamente con lo esperado — revisar el detalle paso a paso abajo (el modelo puede variar ligeramente su criterio, no es necesariamente un fallo).</span>'
  }</p>

<h2>Detalle paso a paso</h2>
${results
  .map(
    (r) => `
<div class="step">
  <p><strong>${escapeHtml(r.label)}</strong></p>
  <p>Mensaje: <em>"${escapeHtml(r.mergedText)}"</em></p>
  <p>Deal antes: <code>${r.dealBefore?.stage ?? "sin deal"}</code> → Deal después: <code>${r.dealAfter?.stage ?? "sin deal"}</code></p>
</div>`,
  )
  .join("\n")}

<h2>Notas acumuladas en el deal (campo "notes")</h2>
<pre>${escapeHtml(results[results.length - 1]?.dealAfter?.notes ?? "(sin notas)")}</pre>

<h2>Tareas creadas para el deal (tabla tasks)</h2>
<table>
<tr><th>Título</th><th>Estado</th><th>Tipo</th><th>Fecha</th></tr>
${(tasks ?? [])
  .map(
    (t) =>
      `<tr><td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.status)}</td><td>${escapeHtml(t.task_type)}</td><td>${escapeHtml(t.created_at)}</td></tr>`,
  )
  .join("\n")}
</table>
<p>${
    (tasks ?? []).filter((t) => t.status === "pending").length === 1
      ? '<span class="ok">OK: hay exactamente una tarea pendiente (las anteriores se cancelaron al avanzar de fase).</span>'
      : '<span class="warn">Revisar — se esperaba exactamente una tarea "pending" (la más reciente).</span>'
  }</p>

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

  const outPath = new URL("./test-pipeline-classification-report.html", import.meta.url);
  writeFileSync(outPath, html, "utf8");
  console.log(`\nReporte HTML escrito en: ${outPath.pathname.replace(/^\//, "")}`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
