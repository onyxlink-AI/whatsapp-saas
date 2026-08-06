// Prueba la orquestación TS de team-chat-attachments.ts (detección de MIME
// real por magic bytes vs. declarado, máquina de estados de escaneo,
// borrado en Storage cuando el resultado no es 'clean') contra el
// Postgres/Storage local reales — solo se mockean las dos piezas atadas a
// un contexto de petición real de Next.js que no existe en Vitest
// (next/server's after(), @/lib/supabase/server's cookies()-based
// createClient, sustituido aquí por un cliente real ya autenticado) y el
// escáner antimalware externo (para no depender de la red real ni de una
// CLOUDMERSIVE_API_KEY, igual que el resto de pruebas de integración de
// este repo que dependen de un servicio externo). Se salta (no falla) si el
// stack local no está arriba.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
const CLIENTE_A_EMAIL = "cliente@empresaa.local";
const CLIENTE_A_PASSWORD = "TestLocal123!";
const BUCKET = "team-chat-files";
const RUN_TAG = `chat-attach-actions-${Date.now()}`;

const state = vi.hoisted(() => ({ sessionClient: null as unknown }));
const scanMock = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => fn() };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.sessionClient,
}));

vi.mock("@/lib/malware-scan/cloudmersive", () => ({
  scanFileForMalware: (...args: unknown[]) => scanMock.fn(...args),
}));

const PDF_BYTES = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF", "utf8");

let reachable = false;
let db: SupabaseClient;
let clientA: SupabaseClient;
let generalAId: string;

async function pollUntilReachable(check: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}

describe("team-chat-attachments.ts — orquestación (Postgres/Storage reales, escáner mockeado)", () => {
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
    const { error: enableErr } = await db.rpc("set_team_chat_enabled", {
      p_workspace_id: EMPRESA_A,
      p_enabled: true,
      p_human_member_limit: 10,
    });
    if (enableErr) throw new Error(`set_team_chat_enabled falló: ${enableErr.message}`);
    const { data: generalA } = await db.from("team_channels").select("id").eq("workspace_id", EMPRESA_A).eq("kind", "general").single();
    generalAId = generalA!.id as string;

    clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInErr } = await clientA.auth.signInWithPassword({ email: CLIENTE_A_EMAIL, password: CLIENTE_A_PASSWORD });
    if (signInErr) throw new Error(`login cliente A falló: ${signInErr.message}`);
    state.sessionClient = clientA;
  }, 45_000);

  afterAll(async () => {
    if (!reachable) return;
    await clientA?.auth.signOut().catch(() => {});
    await db.from("team_message_attachments").delete().like("file_name", `%${RUN_TAG}%`);
    await db.from("team_messages").delete().like("body", `%${RUN_TAG}%`);
    await db.from("workspaces").update({ team_chat_enabled: false, human_member_limit: 1 }).eq("id", EMPRESA_A);
  });

  afterEach(() => {
    scanMock.fn.mockClear();
  });

  it("beginAttachmentUpload reserva el mensaje/adjunto y devuelve un objectPath válido", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { beginAttachmentUpload } = await import("./team-chat-attachments");
    state.sessionClient = clientA;

    const result = await beginAttachmentUpload(generalAId, `${RUN_TAG}-doc.pdf`, "application/pdf", PDF_BYTES.length);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message.attachment?.scan_status).toBe("pending");
    expect(result.data.objectPath).toContain(generalAId);
  });

  it("finalizeAttachmentUpload marca 'clean' cuando el MIME real coincide y el escáner no encuentra nada, y deja el objeto descargable", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { beginAttachmentUpload, finalizeAttachmentUpload } = await import("./team-chat-attachments");
    state.sessionClient = clientA;

    const begin = await beginAttachmentUpload(generalAId, `${RUN_TAG}-limpio.pdf`, "application/pdf", PDF_BYTES.length);
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;

    const { error: uploadErr } = await clientA.storage.from(BUCKET).upload(begin.data.objectPath, PDF_BYTES, { contentType: "application/pdf" });
    expect(uploadErr).toBeNull();

    scanMock.fn.mockResolvedValueOnce({ clean: true });
    const finalized = await finalizeAttachmentUpload(begin.data.attachmentId);
    expect(finalized).toEqual({ ok: true, data: { status: "clean" } });

    const { data: row } = await db.from("team_message_attachments").select("scan_status, detected_mime, sha256_hash, scan_provider").eq("id", begin.data.attachmentId).single();
    expect(row?.scan_status).toBe("clean");
    expect(row?.detected_mime).toBe("application/pdf");
    expect(row?.scan_provider).toBe("cloudmersive");
    expect(typeof row?.sha256_hash).toBe("string");

    const { error: downloadErr } = await db.storage.from(BUCKET).download(begin.data.objectPath);
    expect(downloadErr).toBeNull();
  });

  it("finalizeAttachmentUpload rechaza (MIME falso) cuando los bytes reales no coinciden con lo declarado, y borra el objeto de Storage", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { beginAttachmentUpload, finalizeAttachmentUpload } = await import("./team-chat-attachments");
    state.sessionClient = clientA;

    // Se declara application/pdf pero se sube texto plano — el mismo vector
    // de "MIME falso" que ni whatsapp-media ni project-covers verificaban
    // antes de esta feature.
    const begin = await beginAttachmentUpload(generalAId, `${RUN_TAG}-falso.pdf`, "application/pdf", 40);
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;

    const fakeBytes = Buffer.from("esto no es un pdf de verdad, es texto");
    await clientA.storage.from(BUCKET).upload(begin.data.objectPath, fakeBytes, { contentType: "application/pdf" });

    const finalized = await finalizeAttachmentUpload(begin.data.attachmentId);
    expect(finalized).toEqual({ ok: true, data: { status: "rejected" } });
    expect(scanMock.fn).not.toHaveBeenCalled(); // rechazado antes de gastar una llamada de escaneo real

    const { data: row } = await db.from("team_message_attachments").select("scan_status").eq("id", begin.data.attachmentId).single();
    expect(row?.scan_status).toBe("rejected");

    const { error: downloadErr } = await db.storage.from(BUCKET).download(begin.data.objectPath);
    expect(downloadErr).not.toBeNull(); // el objeto ya no existe
  });

  it("finalizeAttachmentUpload marca 'infected' cuando el escáner encuentra un virus, y borra el objeto de Storage", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { beginAttachmentUpload, finalizeAttachmentUpload } = await import("./team-chat-attachments");
    state.sessionClient = clientA;

    const begin = await beginAttachmentUpload(generalAId, `${RUN_TAG}-infectado.pdf`, "application/pdf", PDF_BYTES.length);
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    await clientA.storage.from(BUCKET).upload(begin.data.objectPath, PDF_BYTES, { contentType: "application/pdf" });

    scanMock.fn.mockResolvedValueOnce({ clean: false, reason: "INFECTED:EICAR-Test-Signature" });
    const finalized = await finalizeAttachmentUpload(begin.data.attachmentId);
    expect(finalized).toEqual({ ok: true, data: { status: "infected" } });

    const { error: downloadErr } = await db.storage.from(BUCKET).download(begin.data.objectPath);
    expect(downloadErr).not.toBeNull();
  });

  it("finalizeAttachmentUpload falla cerrado a 'error' (nunca 'clean') si el escáner no está configurado", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { beginAttachmentUpload, finalizeAttachmentUpload } = await import("./team-chat-attachments");
    state.sessionClient = clientA;

    const begin = await beginAttachmentUpload(generalAId, `${RUN_TAG}-sinescaner.pdf`, "application/pdf", PDF_BYTES.length);
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    await clientA.storage.from(BUCKET).upload(begin.data.objectPath, PDF_BYTES, { contentType: "application/pdf" });

    scanMock.fn.mockResolvedValueOnce({ clean: false, reason: "SCANNER_NOT_CONFIGURED" });
    const finalized = await finalizeAttachmentUpload(begin.data.attachmentId);
    expect(finalized).toEqual({ ok: true, data: { status: "error" } });
  });

  it("cancelAttachmentUpload deja el adjunto en 'error' para que un fallo de subida a mitad no se quede en 'Analizando…' para siempre", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { beginAttachmentUpload, cancelAttachmentUpload } = await import("./team-chat-attachments");
    state.sessionClient = clientA;

    const begin = await beginAttachmentUpload(generalAId, `${RUN_TAG}-cancelado.pdf`, "application/pdf", 500);
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;

    const cancelled = await cancelAttachmentUpload(begin.data.attachmentId);
    expect(cancelled).toEqual({ ok: true, data: null });

    const { data: row } = await db.from("team_message_attachments").select("scan_status").eq("id", begin.data.attachmentId).single();
    expect(row?.scan_status).toBe("error");
  });

  it("getAttachmentDownloadUrl solo devuelve una URL cuando scan_status='clean'", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { beginAttachmentUpload, finalizeAttachmentUpload, getAttachmentDownloadUrl } = await import("./team-chat-attachments");
    state.sessionClient = clientA;

    const begin = await beginAttachmentUpload(generalAId, `${RUN_TAG}-descarga.pdf`, "application/pdf", PDF_BYTES.length);
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;

    const pendingResult = await getAttachmentDownloadUrl(begin.data.attachmentId);
    expect(pendingResult).toEqual({ ok: false, error: "ATTACHMENT_NOT_READY" });

    await clientA.storage.from(BUCKET).upload(begin.data.objectPath, PDF_BYTES, { contentType: "application/pdf" });
    scanMock.fn.mockResolvedValueOnce({ clean: true });
    await finalizeAttachmentUpload(begin.data.attachmentId);

    const cleanResult = await getAttachmentDownloadUrl(begin.data.attachmentId);
    expect(cleanResult.ok).toBe(true);
    if (cleanResult.ok) expect(cleanResult.data.url).toContain("http");
  });

  // Regresión: getChannelMessages() (team-chat-actions.ts) solo seleccionaba
  // columnas de team_messages, sin unir team_message_attachments — un
  // mensaje con adjunto se veía completo únicamente durante la propia
  // sesión de subida (donde el composer ya conocía el adjunto de memoria);
  // al recargar el canal o reabrirlo, volvía como texto plano con el body
  // placeholder ("📎 nombre.pdf") en vez del bloque de adjunto real
  // (detectado en la revisión visual de Fase 2).
  it("getChannelMessages() devuelve el adjunto de un mensaje, no solo su body placeholder", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { beginAttachmentUpload } = await import("./team-chat-attachments");
    const { getChannelMessages } = await import("./team-chat-actions");
    state.sessionClient = clientA;

    const begin = await beginAttachmentUpload(generalAId, `${RUN_TAG}-historial.pdf`, "application/pdf", PDF_BYTES.length);
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;

    const page = await getChannelMessages(generalAId, null, 50);
    const message = page.messages.find((m) => m.id === begin.data.message.id);
    expect(message?.attachment?.id).toBe(begin.data.attachmentId);
    expect(message?.attachment?.scan_status).toBe("pending");
    expect(message?.attachment?.file_name).toBe(`${RUN_TAG}-historial.pdf`);
  });
});
