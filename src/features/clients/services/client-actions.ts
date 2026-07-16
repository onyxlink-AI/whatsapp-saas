"use server";

/**
 * client-actions.ts — Server actions for the "Clientes" CRM (create/update/
 * delete/list). A client is a row in the shared `contacts` table (the same
 * one used by WhatsApp/Pipeline), extended with company/notes/client_status.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ClientRow, ClientStatus } from "@/features/clients/types";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

const ClientInputSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  phone: z.string().min(1, "El teléfono es requerido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  company_name: z.string().optional().or(z.literal("")),
  client_status: z.enum(["activo", "potencial", "archivado"]).optional(),
  notes: z.string().optional().or(z.literal("")),
});

export type ClientInput = z.infer<typeof ClientInputSchema>;

const CONTACT_SELECT = "*, company:companies(id,workspace_id,name,created_at)";

// ──────────────────────────────────────────────────────────────────────────────
// findOrCreateCompanyId — "type or create" semantics for the Empresa field,
// mirroring Twenty CRM's Company<->Person relation (reimplemented from
// scratch here, not reused code — see migration header for why).
// ──────────────────────────────────────────────────────────────────────────────
async function findOrCreateCompanyId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  companyName: string | undefined,
): Promise<string | null> {
  const trimmed = companyName?.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", trimmed)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("companies")
    .insert({ workspace_id: workspaceId, name: trimmed })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[findOrCreateCompanyId] Supabase error:", error?.message);
    return null;
  }

  return created.id as string;
}

// ──────────────────────────────────────────────────────────────────────────────
// listClients
// ──────────────────────────────────────────────────────────────────────────────
export async function listClients(
  workspaceId: string,
  opts: { search?: string; status?: ClientStatus | "all" } = {},
): Promise<ClientRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { search = "", status = "all" } = opts;
  const trimmedSearch = search.trim();

  let matchingCompanyIds: string[] = [];
  if (trimmedSearch) {
    const { data: companies } = await supabase
      .from("companies")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("name", `%${trimmedSearch}%`);
    matchingCompanyIds = (companies ?? []).map((c) => c.id as string);
  }

  let query = supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("client_status", status);
  }

  if (trimmedSearch) {
    const q = `%${trimmedSearch}%`;
    const orParts = [`name.ilike.${q}`, `phone.ilike.${q}`];
    if (matchingCompanyIds.length > 0) {
      orParts.push(`company_id.in.(${matchingCompanyIds.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error("[listClients] Supabase error:", error?.message);
    return [];
  }

  return data as unknown as ClientRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// getClient
// ──────────────────────────────────────────────────────────────────────────────
export async function getClient(clientId: string): Promise<ClientRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("id", clientId)
    .single();

  if (error || !data) {
    console.error("[getClient] error:", error?.message);
    return null;
  }

  return data as unknown as ClientRow;
}

// ──────────────────────────────────────────────────────────────────────────────
// createClient (client entity, not to be confused with the Supabase client)
// ──────────────────────────────────────────────────────────────────────────────
export async function createClientRecord(
  workspaceId: string,
  data: ClientInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = ClientInputSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const companyId = await findOrCreateCompanyId(
    supabase,
    workspaceId,
    parsed.data.company_name,
  );

  const { data: inserted, error: insertError } = await supabase
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      company_id: companyId,
      client_status: parsed.data.client_status ?? "potencial",
      notes: parsed.data.notes || null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[createClientRecord] Supabase error:", insertError?.message);
    return {
      ok: false,
      error: insertError?.code === "23505"
        ? "Ya existe un cliente con ese teléfono"
        : "Error al crear el cliente",
    };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateClientRecord
// ──────────────────────────────────────────────────────────────────────────────
export async function updateClientRecord(
  clientId: string,
  data: ClientInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = ClientInputSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("contacts")
    .select("workspace_id")
    .eq("id", clientId)
    .single();

  if (lookupError || !existing) {
    return { ok: false, error: "Cliente no encontrado" };
  }

  const companyId = await findOrCreateCompanyId(
    supabase,
    (existing as { workspace_id: string }).workspace_id,
    parsed.data.company_name,
  );

  const { data: updated, error: updateError } = await supabase
    .from("contacts")
    .update({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      company_id: companyId,
      client_status: parsed.data.client_status ?? "potencial",
      notes: parsed.data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId)
    .select("id")
    .single();

  if (updateError || !updated) {
    console.error("[updateClientRecord] Supabase error:", updateError?.message);
    return {
      ok: false,
      error: updateError?.code === "23505"
        ? "Ya existe un cliente con ese teléfono"
        : "Error al actualizar el cliente",
    };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteClientRecord — hard delete; cascades to the contact's deals/tasks/
// messages (FK ON DELETE CASCADE). UI must confirm this explicitly.
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteClientRecord(
  clientId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase.from("contacts").delete().eq("id", clientId);

  if (error) {
    console.error("[deleteClientRecord] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar el cliente" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteClientRecords — bulk hard delete for multi-select in the table.
// Same cascade caveat as deleteClientRecord; UI must confirm explicitly.
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteClientRecords(
  clientIds: string[],
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  if (clientIds.length === 0) {
    return { ok: true, data: null };
  }

  const { error } = await supabase.from("contacts").delete().in("id", clientIds);

  if (error) {
    console.error("[deleteClientRecords] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar los clientes" };
  }

  return { ok: true, data: null };
}
