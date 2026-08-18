"use server";

/**
 * kpi-queries.ts — read-only Server Actions for agency_client_relationships
 * / agency_sales_meetings / the workspace picker. Mirrors the auth/client
 * conventions of features/agency-goals/services/goal-actions.ts:
 * requirePlatformStaff() first, request-scoped createClient() (RLS-respecting,
 * NEVER service_role), RLS on both tables (public.is_platform_staff()) is
 * the real barrier — this is defense in depth.
 *
 * Both lists are fetched once per page load and reused for the KPI cards AND
 * the tables (kpi-calculations.ts runs client-side over this same data) —
 * deliberately avoids a separate "summary" round-trip per card.
 */

import { createClient } from "@/lib/supabase/server";
import { requirePlatformStaff } from "@/lib/auth/platform-access";
import type { AgencyClientRelationshipWithWorkspace, AgencySalesMeetingRow, RegistrableWorkspace } from "../types";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

function mapRelationshipRow(row: Record<string, unknown>): AgencyClientRelationshipWithWorkspace {
  const workspaceRaw = row.workspace as { id: string; name: string } | { id: string; name: string }[] | null;
  const workspace = Array.isArray(workspaceRaw) ? (workspaceRaw[0] ?? null) : workspaceRaw;
  return {
    id: row.id as string,
    workspace_id: (row.workspace_id as string | null) ?? null,
    client_name_snapshot: row.client_name_snapshot as string,
    service_started_on: row.service_started_on as string,
    service_ended_on: (row.service_ended_on as string | null) ?? null,
    monthly_fee: (row.monthly_fee as number | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    workspace,
  };
}

export async function listClientRelationships(): Promise<ActionResult<AgencyClientRelationshipWithWorkspace[]>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agency_client_relationships")
    .select("*, workspace:workspaces(id, name)")
    .order("service_started_on", { ascending: false });

  if (error) {
    console.error("[listClientRelationships] Supabase error:", error.message);
    return { ok: false, error: "Error al cargar los clientes de la agencia" };
  }

  return { ok: true, data: ((data ?? []) as Record<string, unknown>[]).map(mapRelationshipRow) };
}

export async function listSalesMeetings(): Promise<ActionResult<AgencySalesMeetingRow[]>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agency_sales_meetings")
    .select("*")
    .order("scheduled_at", { ascending: false });

  if (error) {
    console.error("[listSalesMeetings] Supabase error:", error.message);
    return { ok: false, error: "Error al cargar las reuniones comerciales" };
  }

  return { ok: true, data: (data ?? []) as AgencySalesMeetingRow[] };
}

/**
 * Todos los workspaces visibles para personal de plataforma (política
 * "workspaces_select_staff_directory", 20260818120000_agency_kpis.sql) — el
 * formulario de alta de cliente calcula "todavía no registrado" cruzando
 * esta lista con los workspace_id ya presentes en listClientRelationships(),
 * sin una tercera consulta.
 */
export async function listAllWorkspaces(): Promise<ActionResult<RegistrableWorkspace[]>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("workspaces").select("id, name").order("name", { ascending: true });

  if (error) {
    console.error("[listAllWorkspaces] Supabase error:", error.message);
    return { ok: false, error: "Error al cargar las empresas" };
  }

  return { ok: true, data: (data ?? []) as RegistrableWorkspace[] };
}
