import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { buildSystemPrompt } from "../src/features/inbox/services/prompt-builder";
import { generateChatReply } from "../src/features/inbox/services/openrouter";
import { getBusinessInfo, buildBusinessInfoContext, buildNowContext } from "../src/features/inbox/services/business-info";
import { resolveSystemPrompt } from "../src/features/inbox/services/prompt-resolver";
import { getActiveAgent } from "../src/features/agents/services/active-agent";

// Local, one-off smoke test for the new SCOPE_GUARDRAIL in prompt-builder.ts.
// Reproduces the exact off-topic question from the user's screenshot
// ("¿es mejor agua mineralizada o normal para mi perro?") against the real
// Onyxlink business context + active agent's published prompt, to confirm
// the agent now declines instead of answering.

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

  const activeAgent = await getActiveAgent(ws.id);
  const [resolvedPrompt, businessInfo] = await Promise.all([
    resolveSystemPrompt(ws.id, activeAgent ? { mode: activeAgent.type } : {}),
    getBusinessInfo(ws.id),
  ]);

  const structured = businessInfo?.structured as { timezone?: string; name?: string } | null;
  const tz = structured?.timezone ?? "America/Mexico_City";
  const bizContext = buildBusinessInfoContext(businessInfo);
  const promptBase = resolvedPrompt?.body ?? "Eres un asistente de WhatsApp. Responde de forma concisa y útil en español.";

  const systemPrompt = buildSystemPrompt({
    nowContext: buildNowContext(tz),
    bizContext,
    promptBase,
    responseStyle: activeAgent?.config.responseStyle ?? null,
    guardrails: resolvedPrompt?.guardrails ?? null,
    vars: {
      agentName: activeAgent?.name ?? null,
      businessName: structured?.name ?? null,
      contactName: null,
    },
  });

  const offTopicQuestion = "Oye para mi perro es mejor agua mineralizada o normal";

  console.log(`Agente activo: ${activeAgent?.name ?? "(ninguno)"} (${activeAgent?.type ?? "n/a"})`);
  console.log(`Pregunta fuera de tema: "${offTopicQuestion}"`);
  console.log("Generando respuesta real...\n");

  const reply = await generateChatReply({
    model: activeAgent?.model ?? undefined,
    systemPrompt,
    messages: [{ role: "user", content: offTopicQuestion }],
    maxOutputTokens: 300,
    workspaceId: ws.id,
  });

  console.log("=== Respuesta del agente ===");
  console.log(reply.text);
  console.log("============================\n");

  const answeredOffTopic = /agua|hidrataci[oó]n|mineral/i.test(reply.text) &&
    !/no (est[aá]|forma parte|tengo) (dentro de mi conocimiento|información)/i.test(reply.text);

  if (answeredOffTopic) {
    console.log("POSIBLE FALLO: la respuesta parece seguir hablando del tema fuera de contexto (agua para el perro).");
  } else {
    console.log("OK: la respuesta no parece responder la pregunta fuera de tema.");
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
