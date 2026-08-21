"use server";

/**
 * schedule-actions.ts — Server actions for agency_schedule_blocks CRUD.
 *
 * TAREA 4A (depende de TAREA 1/1B, y del directorio de personal habilitado
 * por TAREA 2): cada acción llama primero a requirePlatformStaff() — nunca
 * solo supabase.auth.getUser() — y usa el cliente de sesión normal
 * (createClient() de @/lib/supabase/server, que respeta RLS), NUNCA el
 * cliente service_role. RLS en agency_schedule_blocks
 * (public.is_platform_staff()) es la barrera real; requirePlatformStaff()
 * aquí es defensa en profundidad para devolver un error claro antes de
 * tocar la base de datos, no la única barrera.
 *
 * created_by/updated_by NUNCA salen del input del formulario —
 * schedule-schemas.ts ni siquiera declara esos campos, y el trigger de
 * Postgres (enforce_agency_schedule_blocks_actor_columns) los fuerza a
 * auth.uid() como última barrera.
 */

import { createClient } from "@/lib/supabase/server";
import { requirePlatformStaff } from "@/lib/auth/platform-access";
import {
  ScheduleBlockCreateSchema,
  ScheduleBlockUpdateSchema,
  ScheduleBlockIdSchema,
  type ScheduleBlockCreateInput,
  type ScheduleBlockUpdateInput,
} from "./schedule-schemas";
import type { AgencyScheduleBlockWithResponsible, AgencyScheduleResponsible } from "../types";

export type ActionResult<T> = { ok: true; data: T; error?: never } | { ok: false; data?: never; error: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const UNIQUE_VIOLATION = "23505";

// ──────────────────────────────────────────────────────────────────────────────
// assertResponsibleIsActiveStaff — "responsable no interno o inactivo
// rechazado". Lee con el mismo cliente de sesión (nunca service_role); la
// política "users_select_staff_directory" (20260818094500_agency_goals.sql)
// es lo que hace posible que un internal_admin sin workspace pueda ver la
// fila de otro miembro del personal para validar esto. Solo se llama para
// una asignación NUEVA (ver createScheduleBlock/updateScheduleBlock) — nunca
// para revalidar un responsible_id que la fila ya tenía, igual que el
// trigger de Postgres que es la barrera final.
// ──────────────────────────────────────────────────────────────────────────────
async function assertResponsibleIsActiveStaff(supabase: SupabaseServerClient, responsibleId: string): Promise<boolean> {
  const { data } = await supabase.from("users").select("platform_role, is_super_admin, is_active").eq("id", responsibleId).maybeSingle();

  if (!data) return false;
  if (data.is_active !== true) return false;
  return data.platform_role === "internal_admin" || data.platform_role === "super_admin" || data.is_super_admin === true;
}

function mapScheduleBlockRow(row: Record<string, unknown>): AgencyScheduleBlockWithResponsible {
  const responsibleRaw = row.responsible as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
  const responsible: AgencyScheduleResponsible | null = Array.isArray(responsibleRaw) ? (responsibleRaw[0] ?? null) : responsibleRaw;
  return {
    id: row.id as string,
    weekday: row.weekday as AgencyScheduleBlockWithResponsible["weekday"],
    hour: row.hour as number,
    content: row.content as string,
    color_key: row.color_key as AgencyScheduleBlockWithResponsible["color_key"],
    responsible_id: (row.responsible_id as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    responsible,
  };
}

// Convierte el 23505 (UNIQUE (weekday, hour) ya ocupada) en un mensaje
// comprensible; cualquier otro error se registra y devuelve un mensaje
// genérico, sin filtrar detalles internos de Postgres al cliente.
function translateScheduleError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === UNIQUE_VIOLATION) {
    return "Ya existe un bloque de horario para ese día y esa hora";
  }
  console.error("[agency_schedule_blocks] Supabase error:", error.message);
  return fallback;
}

// ──────────────────────────────────────────────────────────────────────────────
// listScheduleBlocks — la plantilla semanal completa, ordenada lunes→domingo
// y hora a hora. El volumen (máximo 7*24=168 filas) no justifica paginar.
// ──────────────────────────────────────────────────────────────────────────────
export async function listScheduleBlocks(): Promise<ActionResult<AgencyScheduleBlockWithResponsible[]>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agency_schedule_blocks")
    .select("*, responsible:users!fk_agency_schedule_blocks_responsible(id, full_name)")
    .order("weekday", { ascending: true })
    .order("hour", { ascending: true });

  if (error) {
    console.error("[listScheduleBlocks] Supabase error:", error.message);
    return { ok: false, error: "Error al cargar el horario" };
  }

  return { ok: true, data: ((data ?? []) as Record<string, unknown>[]).map(mapScheduleBlockRow) };
}

// ──────────────────────────────────────────────────────────────────────────────
// createScheduleBlock
// ──────────────────────────────────────────────────────────────────────────────
export async function createScheduleBlock(input: ScheduleBlockCreateInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsed = ScheduleBlockCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();

  if (parsed.data.responsible_id) {
    const validResponsible = await assertResponsibleIsActiveStaff(supabase, parsed.data.responsible_id);
    if (!validResponsible) {
      return { ok: false, error: "El responsable debe ser personal interno activo de Onyxlink" };
    }
  }

  const { data: inserted, error } = await supabase
    .from("agency_schedule_blocks")
    .insert({
      weekday: parsed.data.weekday,
      hour: parsed.data.hour,
      content: parsed.data.content,
      color_key: parsed.data.color_key,
      responsible_id: parsed.data.responsible_id ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      error: translateScheduleError(error ?? { message: "insert returned no row" }, "Error al crear el bloque de horario"),
    };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateScheduleBlock — actualización parcial real: solo se escriben los
// campos explícitamente enviados.
// ──────────────────────────────────────────────────────────────────────────────
export async function updateScheduleBlock(blockId: string, input: ScheduleBlockUpdateInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsedId = ScheduleBlockIdSchema.safeParse(blockId);
  if (!parsedId.success) {
    return { ok: false, error: "Identificador de bloque inválido" };
  }

  const parsed = ScheduleBlockUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "No se proporcionaron campos a actualizar" };
  }

  const supabase = await createClient();

  // TAREA 4A.1: un responsable_id no nulo solo debe exigir "personal interno
  // activo" cuando es una asignación NUEVA — nunca cuando es exactamente el
  // responsable que la fila ya tenía (mismo criterio que el trigger de
  // Postgres enforce_agency_schedule_blocks_responsible_is_staff, que solo
  // se dispara cuando responsible_id cambia). Sin esto, un responsable
  // histórico que pasó a inactivo bloquearía cualquier edición futura del
  // bloque aunque nadie estuviera reasignándolo — la interfaz nunca tendría
  // que enviar un patch mínimo para evitarlo, esto se resuelve aquí.
  //
  // La lectura usa el cliente de sesión normal (nunca service_role) y
  // respeta RLS: si el bloque no es visible/no existe, currentBlock es null.
  if (parsed.data.responsible_id) {
    const { data: currentBlock, error: currentBlockError } = await supabase
      .from("agency_schedule_blocks")
      .select("responsible_id")
      .eq("id", parsedId.data)
      .maybeSingle();

    if (currentBlockError) {
      console.error("[updateScheduleBlock] Supabase error:", currentBlockError.message);
      return { ok: false, error: "Error al actualizar el bloque de horario" };
    }
    if (!currentBlock) {
      return { ok: false, error: "Bloque de horario no encontrado" };
    }

    if (currentBlock.responsible_id !== parsed.data.responsible_id) {
      const validResponsible = await assertResponsibleIsActiveStaff(supabase, parsed.data.responsible_id);
      if (!validResponsible) {
        return { ok: false, error: "El responsable debe ser personal interno activo de Onyxlink" };
      }
    }
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.weekday !== undefined) patch.weekday = parsed.data.weekday;
  if (parsed.data.hour !== undefined) patch.hour = parsed.data.hour;
  if (parsed.data.content !== undefined) patch.content = parsed.data.content;
  if (parsed.data.color_key !== undefined) patch.color_key = parsed.data.color_key;
  if (parsed.data.responsible_id !== undefined) patch.responsible_id = parsed.data.responsible_id;

  // .eq("id", blockId) limita la escritura a UNA fila por su clave primaria
  // — nunca una actualización masiva sin filtrar por id.
  const { data: updated, error } = await supabase
    .from("agency_schedule_blocks")
    .update(patch)
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: translateScheduleError(error, "Error al actualizar el bloque de horario") };
  }
  if (!updated) {
    return { ok: false, error: "Bloque de horario no encontrado" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteScheduleBlock
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteScheduleBlock(blockId: string): Promise<ActionResult<null>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsedId = ScheduleBlockIdSchema.safeParse(blockId);
  if (!parsedId.success) {
    return { ok: false, error: "Identificador de bloque inválido" };
  }

  const supabase = await createClient();
  const { error, count } = await supabase.from("agency_schedule_blocks").delete({ count: "exact" }).eq("id", parsedId.data);

  if (error) {
    console.error("[deleteScheduleBlock] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar el bloque de horario" };
  }
  if (!count) {
    return { ok: false, error: "Bloque de horario no encontrado" };
  }

  return { ok: true, data: null };
}
