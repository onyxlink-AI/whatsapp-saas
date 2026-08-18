"use server";

/**
 * goal-actions.ts — Server actions for agency_goals CRUD.
 *
 * TAREA 2 (depende de TAREA 1/1B): cada acción llama primero a
 * requirePlatformStaff() — nunca solo supabase.auth.getUser() como hacen
 * las acciones de workspace — y usa el cliente de sesión normal
 * (createClient() de @/lib/supabase/server, que respeta RLS), NUNCA el
 * cliente service_role. RLS en agency_goals (public.is_platform_staff())
 * es la barrera real; requirePlatformStaff() aquí es defensa en
 * profundidad para devolver un error claro antes de tocar la base de
 * datos, no la única barrera.
 *
 * created_by SIEMPRE sale de requirePlatformStaff().userId — nunca del
 * input del formulario (GoalCreateSchema ni siquiera declara ese campo).
 * period_start/period_end SIEMPRE salen de resolvePeriodBounds() —
 * goal-schemas.ts tampoco declara esos campos, así que no hay forma de
 * que el formulario los envíe aunque quisiera.
 */

import { createClient } from "@/lib/supabase/server";
import { requirePlatformStaff } from "@/lib/auth/platform-access";
import { resolvePeriodBounds } from "./period-calculator";
import { GoalCreateSchema, GoalUpdateSchema, GoalIdSchema, GoalPeriodTypeEnum, type GoalCreateInput, type GoalUpdateInput } from "./goal-schemas";
import type { AgencyGoalWithOwner, AgencyGoalOwner, GoalPeriodType } from "../types";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ──────────────────────────────────────────────────────────────────────────────
// assertOwnerIsPlatformStaff — "Responsable externo/no interno rechazado".
// Lee con el mismo cliente de sesión (nunca service_role); la política
// "users_select_staff_directory" (misma migración que agency_goals) es lo
// que hace posible que un internal_admin sin workspace pueda ver la fila de
// otro miembro del personal para validar esto.
// ──────────────────────────────────────────────────────────────────────────────
async function assertOwnerIsPlatformStaff(supabase: SupabaseServerClient, ownerId: string): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("platform_role, is_super_admin")
    .eq("id", ownerId)
    .maybeSingle();

  if (!data) return false;
  return data.platform_role === "internal_admin" || data.platform_role === "super_admin" || data.is_super_admin === true;
}

function mapGoalRow(row: Record<string, unknown>): AgencyGoalWithOwner {
  const ownerRaw = row.owner as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
  const owner: AgencyGoalOwner | null = Array.isArray(ownerRaw) ? (ownerRaw[0] ?? null) : ownerRaw;
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    period_type: row.period_type as AgencyGoalWithOwner["period_type"],
    period_start: row.period_start as string,
    period_end: row.period_end as string,
    owner_id: (row.owner_id as string | null) ?? null,
    status: row.status as AgencyGoalWithOwner["status"],
    progress: row.progress as number,
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    owner,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// listGoals — todos los objetivos de un tipo de periodo, más recientes
// primero. El filtro por año lo hace la UI sobre este mismo listado (el
// volumen de objetivos internos de la agencia no justifica ida y vuelta al
// servidor por cada año).
// ──────────────────────────────────────────────────────────────────────────────
export async function listGoals(periodType: GoalPeriodType): Promise<ActionResult<AgencyGoalWithOwner[]>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  // TAREA 2B: periodType llega en runtime a una Server Action (nada impide
  // una llamada directa con un string arbitrario pese al tipado de
  // TypeScript) — se valida contra el enum real antes de tocar Supabase.
  const parsedPeriodType = GoalPeriodTypeEnum.safeParse(periodType);
  if (!parsedPeriodType.success) {
    return { ok: false, error: "Tipo de periodo inválido" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agency_goals")
    .select("*, owner:users!fk_agency_goals_owner(id, full_name)")
    .eq("period_type", parsedPeriodType.data)
    .order("period_start", { ascending: false });

  if (error) {
    console.error("[listGoals] Supabase error:", error.message);
    return { ok: false, error: "Error al cargar los objetivos" };
  }

  return { ok: true, data: ((data ?? []) as Record<string, unknown>[]).map(mapGoalRow) };
}

// ──────────────────────────────────────────────────────────────────────────────
// listPlatformStaffUsers — para el selector de responsable. internal_admin
// y super_admin, incluido el superadministrador legado (is_super_admin=true
// con platform_role aún sin backfillear) — mismo criterio de
// getPlatformAccess()/is_platform_staff(), no uno nuevo.
// ──────────────────────────────────────────────────────────────────────────────
export async function listPlatformStaffUsers(): Promise<ActionResult<AgencyGoalOwner[]>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, is_super_admin, platform_role")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[listPlatformStaffUsers] Supabase error:", error.message);
    return { ok: false, error: "Error al cargar el personal interno" };
  }

  const staff = ((data ?? []) as { id: string; full_name: string; is_super_admin: boolean; platform_role: string | null }[]).filter(
    (row) => row.platform_role === "internal_admin" || row.platform_role === "super_admin" || row.is_super_admin === true,
  );

  return { ok: true, data: staff.map((row) => ({ id: row.id, full_name: row.full_name })) };
}

// ──────────────────────────────────────────────────────────────────────────────
// createGoal
// ──────────────────────────────────────────────────────────────────────────────
export async function createGoal(input: GoalCreateInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsed = GoalCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();

  if (parsed.data.owner_id) {
    const validOwner = await assertOwnerIsPlatformStaff(supabase, parsed.data.owner_id);
    if (!validOwner) {
      return { ok: false, error: "El responsable debe ser personal interno de Onyxlink" };
    }
  }

  const bounds = resolvePeriodBounds(parsed.data.period);

  const { data: inserted, error } = await supabase
    .from("agency_goals")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description || null,
      period_type: parsed.data.period.type,
      period_start: bounds.start,
      period_end: bounds.end,
      owner_id: parsed.data.owner_id ?? null,
      status: parsed.data.status ?? "pending",
      progress: parsed.data.progress ?? 0,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[createGoal] Supabase error:", error?.message);
    return { ok: false, error: "Error al crear el objetivo" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateGoal — soporta actualización parcial (título, descripción, periodo,
// responsable, estado, progreso) desde un único punto de entrada; la UI usa
// esto tanto para "editar" como para los atajos "cambiar estado"/"cambiar
// progreso" (mandan solo ese campo).
// ──────────────────────────────────────────────────────────────────────────────
export async function updateGoal(goalId: string, input: GoalUpdateInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsedId = GoalIdSchema.safeParse(goalId);
  if (!parsedId.success) {
    return { ok: false, error: "Identificador de objetivo inválido" };
  }

  const parsed = GoalUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "No se proporcionaron campos a actualizar" };
  }

  const supabase = await createClient();

  if (parsed.data.owner_id) {
    const validOwner = await assertOwnerIsPlatformStaff(supabase, parsed.data.owner_id);
    if (!validOwner) {
      return { ok: false, error: "El responsable debe ser personal interno de Onyxlink" };
    }
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description || null;
  if (parsed.data.owner_id !== undefined) patch.owner_id = parsed.data.owner_id;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.progress !== undefined) patch.progress = parsed.data.progress;
  if (parsed.data.period !== undefined) {
    const bounds = resolvePeriodBounds(parsed.data.period);
    patch.period_type = parsed.data.period.type;
    patch.period_start = bounds.start;
    patch.period_end = bounds.end;
  }

  // .eq("id", goalId) limita la escritura a UNA fila por su clave primaria —
  // nunca una actualización masiva sin filtrar por id.
  const { data: updated, error } = await supabase
    .from("agency_goals")
    .update(patch)
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[updateGoal] Supabase error:", error.message);
    return { ok: false, error: "Error al actualizar el objetivo" };
  }
  if (!updated) {
    return { ok: false, error: "Objetivo no encontrado" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteGoal
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteGoal(goalId: string): Promise<ActionResult<null>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsedId = GoalIdSchema.safeParse(goalId);
  if (!parsedId.success) {
    return { ok: false, error: "Identificador de objetivo inválido" };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("agency_goals")
    .delete({ count: "exact" })
    .eq("id", parsedId.data);

  if (error) {
    console.error("[deleteGoal] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar el objetivo" };
  }
  if (!count) {
    return { ok: false, error: "Objetivo no encontrado" };
  }

  return { ok: true, data: null };
}
