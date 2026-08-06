// Documentos privados del Chat de equipo (Fase 2) — igual que
// team-chat-isolation.integration.test.ts, estas pruebas usan JWTs reales de
// dos empresas distintas contra el Postgres/Storage local (nunca solo
// service_role, que haría bypass de RLS y probaría el mock, no el
// aislamiento real). Se saltan (no fallan) si el stack local no está arriba.
// Vive en un archivo hermano en vez de crecer más el archivo de Fase 1 (ya
// supera las 1000 líneas), por indicación del plan de Fase 2.
//
// Lo que NO se prueba aquí: la orquestación TS de finalizeAttachmentUpload()
// (sniffing de magic bytes + llamada a Cloudmersive + broadcast) — esa
// función usa next/server's after() y next/headers's cookies(), ambas
// atadas a un contexto de petición real de Next.js, y esta suite sigue la
// misma convención que el resto del Chat de equipo: probar RLS/RPC/Storage
// directamente con JWTs reales, no importar módulos "use server". La
// detección de MIME real (file-type) se prueba por separado y de forma
// aislada en cloudmersive.test.ts / file-type no necesita mock. El estado
// de cuarentena en sí (pending/clean/rejected/infected/error) SÍ se prueba
// aquí a fondo, invocando finalize_team_attachment_scan directamente con
// service_role — que es exactamente lo que hace esa Server Action una vez
// que ya decidió el resultado.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadDotEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const EMPRESA_A = "1b807ae9-03a2-4cf5-84af-8b72a7078ad9";
const EMPRESA_B = "9003dc6d-dafa-48b3-be17-71e36e08272d";
const CLIENTE_A_EMAIL = "cliente@empresaa.local";
const CLIENTE_A_PASSWORD = "TestLocal123!";

const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;
const BUCKET = "team-chat-files";

async function pollUntilReachable(check: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

let reachable = false;
let db: SupabaseClient; // service_role — solo para preparar/limpiar fixtures y decidir el resultado del escaneo
let clientA: SupabaseClient;
let clientB: SupabaseClient;

let userBId: string;
const userBEmail = `chat-attach-iso-b-${Date.now()}@empresab.local`;
let generalAId: string;
let generalBId: string;

const RUN_TAG = `chat-attach-iso-${Date.now()}`;

async function beginAsRpc(client: SupabaseClient, channelId: string, fileName: string, mime = "application/pdf", size = 1024) {
  return client.rpc("begin_team_attachment_upload", {
    p_channel_id: channelId,
    p_file_name: `${RUN_TAG}-${fileName}`,
    p_declared_mime: mime,
    p_byte_size: size,
  });
}

describe("Chat de equipo — documentos privados: aislamiento entre tenants con JWT reales", () => {
  beforeAll(async () => {
    reachable = await pollUntilReachable(async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
        return r.status < 500;
      } catch {
        return false;
      }
    });
    if (!reachable) return;

    db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: authUser, error: authErr } = await db.auth.admin.createUser({
      email: userBEmail,
      password: "TestLocal123!",
      email_confirm: true,
    });
    if (authErr || !authUser?.user) throw new Error(`fixture usuario Empresa B falló: ${authErr?.message}`);
    userBId = authUser.user.id;
    await db.from("users").insert({ id: userBId, full_name: "Cliente Empresa B (test adjuntos)", email: userBEmail });
    await db.from("memberships").insert({ workspace_id: EMPRESA_B, user_id: userBId, role: "admin", is_active: true });

    const { error: enableErrA } = await db.rpc("set_team_chat_enabled", {
      p_workspace_id: EMPRESA_A,
      p_enabled: true,
      p_human_member_limit: 10,
    });
    if (enableErrA) throw new Error(`set_team_chat_enabled A falló: ${enableErrA.message}`);
    const { error: enableErrB } = await db.rpc("set_team_chat_enabled", {
      p_workspace_id: EMPRESA_B,
      p_enabled: true,
      p_human_member_limit: 10,
    });
    if (enableErrB) throw new Error(`set_team_chat_enabled B falló: ${enableErrB.message}`);

    const { data: generalA } = await db.from("team_channels").select("id").eq("workspace_id", EMPRESA_A).eq("kind", "general").single();
    generalAId = generalA!.id as string;
    const { data: generalB } = await db.from("team_channels").select("id").eq("workspace_id", EMPRESA_B).eq("kind", "general").single();
    generalBId = generalB!.id as string;

    clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInAErr } = await clientA.auth.signInWithPassword({ email: CLIENTE_A_EMAIL, password: CLIENTE_A_PASSWORD });
    if (signInAErr) throw new Error(`login cliente A falló: ${signInAErr.message}`);

    clientB = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInBErr } = await clientB.auth.signInWithPassword({ email: userBEmail, password: "TestLocal123!" });
    if (signInBErr) throw new Error(`login cliente B falló: ${signInBErr.message}`);
  }, POLL_TIMEOUT_MS + 15_000);

  afterAll(async () => {
    if (!reachable) return;
    await clientA?.auth.signOut().catch(() => {});
    await clientB?.auth.signOut().catch(() => {});
    await db.from("team_message_attachments").delete().like("file_name", `%${RUN_TAG}%`);
    await db.from("team_messages").delete().like("body", `%${RUN_TAG}%`);
    if (userBId) {
      await db.from("memberships").delete().eq("user_id", userBId);
      await db.from("users").delete().eq("id", userBId);
      await db.auth.admin.deleteUser(userBId).catch(() => {});
    }
    await db.from("workspaces").update({ team_chat_enabled: false, human_member_limit: 1, team_chat_storage_quota_mb: 500 }).eq("id", EMPRESA_A);
    await db.from("workspaces").update({ team_chat_enabled: false, human_member_limit: 1, team_chat_storage_quota_mb: 500 }).eq("id", EMPRESA_B);
  });

  it("begin_team_attachment_upload reserva el mensaje contenedor y el adjunto en 'pending'", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data, error } = await beginAsRpc(clientA, generalAId, "doc.pdf");
    expect(error).toBeNull();
    const result = data as { messageId: string; attachmentId: string; objectPath: string };
    expect(result.objectPath).toContain(EMPRESA_A);
    expect(result.objectPath).toContain(generalAId);

    const { data: attachmentRow } = await db
      .from("team_message_attachments")
      .select("scan_status, declared_mime, byte_size, file_name")
      .eq("id", result.attachmentId)
      .single();
    expect(attachmentRow?.scan_status).toBe("pending");
    expect(attachmentRow?.declared_mime).toBe("application/pdf");

    const { data: messageRow } = await db.from("team_messages").select("body, sender_id").eq("id", result.messageId).single();
    expect(messageRow?.body).toContain(`${RUN_TAG}-doc.pdf`);
  });

  it("begin_team_attachment_upload rechaza un tipo de archivo fuera de la allowlist", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await beginAsRpc(clientA, generalAId, "virus.exe", "application/x-msdownload");
    expect(error).not.toBeNull();
    expect(error?.message).toContain("UNSUPPORTED_FILE_TYPE");
  });

  it("begin_team_attachment_upload rechaza un tamaño mayor a 10 MB", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await beginAsRpc(clientA, generalAId, "grande.pdf", "application/pdf", 10_485_761);
    expect(error).not.toBeNull();
    expect(error?.message).toContain("FILE_TOO_LARGE");
  });

  it("begin_team_attachment_upload rechaza si el llamador no participa del canal", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await beginAsRpc(clientB, generalAId, "cruzado.pdf", "application/pdf");
    expect(error).not.toBeNull();
    expect(error?.message).toContain("participant");
  });

  it("begin_team_attachment_upload rechaza si el Chat está apagado en el workspace, aunque el canal exista", async (ctx) => {
    if (!reachable) return ctx.skip();
    await db.from("workspaces").update({ team_chat_enabled: false }).eq("id", EMPRESA_B);
    const { error } = await beginAsRpc(clientB, generalBId, "apagado.pdf");
    expect(error).not.toBeNull();
    expect(error?.message).toContain("not enabled");
    await db.from("workspaces").update({ team_chat_enabled: true }).eq("id", EMPRESA_B);
  });

  it("Empresa B no puede leer un adjunto de Empresa A por su id", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data } = await beginAsRpc(clientA, generalAId, "confidencial.pdf");
    const result = data as { attachmentId: string };

    const { data: rowsForB, error } = await clientB.from("team_message_attachments").select("id").eq("id", result.attachmentId);
    expect(error).toBeNull();
    expect(rowsForB ?? []).toHaveLength(0);

    const { data: rowsForA } = await clientA.from("team_message_attachments").select("id").eq("id", result.attachmentId);
    expect(rowsForA ?? []).toHaveLength(1);
  });

  it("storage.objects: Empresa B no puede subir bytes al object_path reservado por Empresa A", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data } = await beginAsRpc(clientA, generalAId, "reservado.pdf");
    const result = data as { objectPath: string };

    const { error } = await clientB.storage.from(BUCKET).upload(result.objectPath, new Blob(["x"], { type: "application/pdf" }));
    expect(error).not.toBeNull();
  });

  it("storage.objects: nadie puede descargar un adjunto todavía 'pending', ni siquiera el propio uploader", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data } = await beginAsRpc(clientA, generalAId, "pendiente.pdf");
    const result = data as { attachmentId: string; objectPath: string };

    await clientA.storage.from(BUCKET).upload(result.objectPath, new Blob(["contenido"], { type: "application/pdf" }));

    const { error: downloadErr } = await clientA.storage.from(BUCKET).download(result.objectPath);
    expect(downloadErr).not.toBeNull();

    // Una vez marcado 'clean' por finalize_team_attachment_scan (service_role
    // — lo que haría la Server Action tras un escaneo real), el propio
    // participante SÍ puede descargarlo, pero Empresa B sigue sin poder.
    const { error: finalizeErr } = await db.rpc("finalize_team_attachment_scan", {
      p_attachment_id: result.attachmentId,
      p_detected_mime: "application/pdf",
      p_sha256_hash: "deadbeef",
      p_scan_status: "clean",
      p_scan_provider: "test",
    });
    expect(finalizeErr).toBeNull();

    const { error: downloadAfterClean } = await clientA.storage.from(BUCKET).download(result.objectPath);
    expect(downloadAfterClean).toBeNull();

    const { error: downloadByB } = await clientB.storage.from(BUCKET).download(result.objectPath);
    expect(downloadByB).not.toBeNull();
  });

  it("finalize_team_attachment_scan a 'rejected'/'infected' deja el adjunto sin poder descargarse", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data } = await beginAsRpc(clientA, generalAId, "falso.pdf");
    const result = data as { attachmentId: string; objectPath: string };
    await clientA.storage.from(BUCKET).upload(result.objectPath, new Blob(["no soy un pdf de verdad"], { type: "application/pdf" }));

    const { error: finalizeErr } = await db.rpc("finalize_team_attachment_scan", {
      p_attachment_id: result.attachmentId,
      p_detected_mime: "text/plain",
      p_sha256_hash: "deadbeef",
      p_scan_status: "rejected",
      p_scan_provider: "test",
    });
    expect(finalizeErr).toBeNull();

    const { data: row } = await db.from("team_message_attachments").select("scan_status").eq("id", result.attachmentId).single();
    expect(row?.scan_status).toBe("rejected");

    const { error: downloadErr } = await clientA.storage.from(BUCKET).download(result.objectPath);
    expect(downloadErr).not.toBeNull();
  });

  it("cancel_team_attachment_upload: solo el propio uploader puede cancelar su subida todavía pendiente", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data } = await beginAsRpc(clientA, generalAId, "cancelable.pdf");
    const result = data as { attachmentId: string };

    const { error: byBErr } = await clientB.rpc("cancel_team_attachment_upload", { p_attachment_id: result.attachmentId });
    expect(byBErr).not.toBeNull();

    const { error: byAErr } = await clientA.rpc("cancel_team_attachment_upload", { p_attachment_id: result.attachmentId });
    expect(byAErr).toBeNull();

    const { data: row } = await db.from("team_message_attachments").select("scan_status").eq("id", result.attachmentId).single();
    expect(row?.scan_status).toBe("error");

    // Ya no está 'pending' — un segundo intento de cancelar debe rechazarse
    // (no se puede "ocultar" un resultado ya conocido volviendo a cancelar).
    const { error: secondCancelErr } = await clientA.rpc("cancel_team_attachment_upload", { p_attachment_id: result.attachmentId });
    expect(secondCancelErr).not.toBeNull();
  });

  it("cuota mensual del workspace: la segunda subida que la supera es rechazada con QUOTA_EXCEEDED", async (ctx) => {
    if (!reachable) return ctx.skip();
    // Los tests anteriores de este archivo ya reservaron bytes contra la
    // cuota de EMPRESA_A (begin_team_attachment_upload cuenta TODO lo
    // subido este mes) — sin limpiar antes, esas reservas previas se
    // sumarían y falsearían el umbral que este test intenta ejercitar.
    // Solo las filas de ESTE archivo de pruebas — nunca un DELETE sin
    // acotar por workspace_id a secas: EMPRESA_A es un fixture compartido
    // (también se usa para pruebas manuales/QA), así que un DELETE amplio
    // borraría adjuntos reales ajenos a esta ejecución. "chat-attach-iso-"
    // (sin el timestamp exacto) también limpia restos de una ejecución
    // anterior que hubiera terminado a medias, sin arriesgar borrar nada
    // que no lleve ese prefijo de prueba en el nombre.
    await db.from("team_message_attachments").delete().eq("workspace_id", EMPRESA_A).like("file_name", "%chat-attach-iso-%");
    await db.from("workspaces").update({ team_chat_storage_quota_mb: 1 }).eq("id", EMPRESA_A); // 1 MB = 1_048_576 bytes

    const first = await beginAsRpc(clientA, generalAId, "cuota1.pdf", "application/pdf", 800_000);
    expect(first.error).toBeNull();

    const second = await beginAsRpc(clientA, generalAId, "cuota2.pdf", "application/pdf", 800_000);
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toContain("QUOTA_EXCEEDED");

    await db.from("workspaces").update({ team_chat_storage_quota_mb: 500 }).eq("id", EMPRESA_A);
  });

  it("cuota mensual del workspace: dos subidas concurrentes que juntas la superan nunca dejan pasar a las dos (FOR UPDATE)", async (ctx) => {
    if (!reachable) return ctx.skip();
    // Solo las filas de ESTE archivo de pruebas — nunca un DELETE sin
    // acotar por workspace_id a secas: EMPRESA_A es un fixture compartido
    // (también se usa para pruebas manuales/QA), así que un DELETE amplio
    // borraría adjuntos reales ajenos a esta ejecución. "chat-attach-iso-"
    // (sin el timestamp exacto) también limpia restos de una ejecución
    // anterior que hubiera terminado a medias, sin arriesgar borrar nada
    // que no lleve ese prefijo de prueba en el nombre.
    await db.from("team_message_attachments").delete().eq("workspace_id", EMPRESA_A).like("file_name", "%chat-attach-iso-%");
    await db.from("workspaces").update({ team_chat_storage_quota_mb: 1 }).eq("id", EMPRESA_A); // 1 MB = 1_048_576 bytes

    const [r1, r2] = await Promise.allSettled([
      beginAsRpc(clientA, generalAId, "carrera1.pdf", "application/pdf", 700_000),
      beginAsRpc(clientA, generalAId, "carrera2.pdf", "application/pdf", 700_000),
    ]);
    const results = [r1, r2].map((r) => (r.status === "fulfilled" ? r.value.error : r.reason));
    const succeeded = results.filter((e) => !e).length;
    const failed = results.filter((e) => Boolean(e)).length;
    expect(succeeded).toBe(1);
    expect(failed).toBe(1);

    await db.from("workspaces").update({ team_chat_storage_quota_mb: 500 }).eq("id", EMPRESA_A);
  });

  describe("Seguridad: begin/finalize/cancel_team_attachment_upload/scan tienen los grants correctos", () => {
    async function rpcAsAnon(fn: string, body: Record<string, unknown>) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    }

    it("anon no puede ejecutar begin_team_attachment_upload directamente vía REST", async (ctx) => {
      if (!reachable) return ctx.skip();
      const { status, body } = await rpcAsAnon("begin_team_attachment_upload", {
        p_channel_id: generalAId,
        p_file_name: "anon.pdf",
        p_declared_mime: "application/pdf",
        p_byte_size: 100,
      });
      expect(status).toBe(401);
      expect(body.code).toBe("42501");
    });

    it("anon no puede ejecutar finalize_team_attachment_scan directamente vía REST", async (ctx) => {
      if (!reachable) return ctx.skip();
      const { status, body } = await rpcAsAnon("finalize_team_attachment_scan", {
        p_attachment_id: "00000000-0000-0000-0000-000000000000",
        p_detected_mime: "application/pdf",
        p_sha256_hash: "x",
        p_scan_status: "clean",
        p_scan_provider: "x",
      });
      expect(status).toBe(401);
      expect(body.code).toBe("42501");
    });

    it("anon no puede ejecutar cancel_team_attachment_upload directamente vía REST", async (ctx) => {
      if (!reachable) return ctx.skip();
      const { status, body } = await rpcAsAnon("cancel_team_attachment_upload", {
        p_attachment_id: "00000000-0000-0000-0000-000000000000",
      });
      expect(status).toBe(401);
      expect(body.code).toBe("42501");
    });

    // Sesión fresca en vez de reutilizar clientA (viva durante todo el
    // archivo): mismo motivo que team-chat-isolation.integration.test.ts —
    // bajo el conjunto completo de tests en paralelo, reutilizar una sesión
    // de larga duración dio 401 en vez de 403 de forma intermitente.
    it("un usuario authenticated normal (no service_role) tampoco puede ejecutar finalize_team_attachment_scan", async (ctx) => {
      if (!reachable) return ctx.skip();
      const freshClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: signInData, error: signInErr } = await freshClient.auth.signInWithPassword({
        email: CLIENTE_A_EMAIL,
        password: CLIENTE_A_PASSWORD,
      });
      expect(signInErr).toBeNull();
      const jwt = signInData.session?.access_token;
      expect(jwt).toBeTruthy();

      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/finalize_team_attachment_scan`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_attachment_id: "00000000-0000-0000-0000-000000000000",
          p_detected_mime: "application/pdf",
          p_sha256_hash: "x",
          p_scan_status: "clean",
          p_scan_provider: "x",
        }),
      });
      expect(r.status).toBe(403);
      const body = await r.json();
      expect(body.code).toBe("42501");
      await freshClient.auth.signOut().catch(() => {});
    });
  });
});
