import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadDotEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
let db: SupabaseClient;
let reachable = false;
let workspaceA = "";
let workspaceB = "";
let projectA = "";
let memberOnlyA = "";

beforeAll(async () => {
  db = createClient(url, serviceKey);
  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
    });
    reachable = response.status < 500;
  } catch {
    return;
  }
  if (!reachable) return;

  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, slug")
    .in("slug", ["empresa-a-prueba-local", "empresa-b-prueba-local"]);
  workspaceA = workspaces?.find((workspace) => workspace.slug === "empresa-a-prueba-local")?.id ?? "";
  workspaceB = workspaces?.find((workspace) => workspace.slug === "empresa-b-prueba-local")?.id ?? "";

  const { data: clientUser } = await db
    .from("users")
    .select("id")
    .eq("email", "cliente@empresaa.local")
    .maybeSingle();
  memberOnlyA = clientUser?.id ?? "";

  const { data: project, error } = await db
    .from("projects")
    .insert({ workspace_id: workspaceA, name: "Aislamiento contenido" })
    .select("id")
    .single();
  if (error || !project) throw new Error(error?.message ?? "No se pudo crear el proyecto de prueba");
  projectA = project.id;
});

afterAll(async () => {
  if (reachable && projectA) await db.from("projects").delete().eq("id", projectA);
});

describe("aislamiento de contenido", () => {
  it("rechaza proyectos y responsables de otra empresa", async () => {
    if (!reachable || !workspaceA || !workspaceB || !projectA || !memberOnlyA) return;

    const crossProject = await db.from("content_items").insert({
      workspace_id: workspaceB,
      project_id: projectA,
      title: "Proyecto cruzado",
    });
    expect(crossProject.error?.message).toContain("same workspace");

    const crossResponsible = await db.from("content_items").insert({
      workspace_id: workspaceB,
      responsible_id: memberOnlyA,
      title: "Responsable cruzado",
    });
    expect(crossResponsible.error?.message).toContain("active workspace member");
  });

  it("rechaza métricas negativas incluso fuera de la interfaz", async () => {
    if (!reachable || !workspaceA) return;
    const result = await db.from("content_items").insert({
      workspace_id: workspaceA,
      title: "Métrica inválida",
      metric_views: -1,
    });
    expect(result.error?.message).toContain("chk_content_metrics_nonnegative");
  });
});
