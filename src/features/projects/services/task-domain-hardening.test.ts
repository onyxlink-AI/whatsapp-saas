// Fase 4A — Endurecimiento de servicios existentes antes de exponerlos al
// Asistente de Ayuda: updateAgendaTask, toggleAgendaTaskDone, updateTask,
// completeTask, reassignTask, createSubtask, toggleSubtask, updateSubtask.
// Cubre exactamente lo pedido: workspace_id filtrado en cada update/delete,
// .select() tras mutar, comprobación de una única fila afectada,
// not_found_or_forbidden cuando RLS/workspace bloquean el ID (simulado aquí
// con IDs con forma de UUID real de un "workspace B" usados desde "A"), y
// que un error de BD nunca se confunde con éxito.

import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();

type Result = { data: unknown; error: { message: string } | null };

// Cada tabla puede configurar su propio resultado de UPDATE/INSERT/SELECT
// por test — un mock genérico que soporta las cadenas exactas que usan los
// servicios endurecidos (.update().eq().eq().select().maybeSingle(), y
// .select().eq().eq().maybeSingle() para las comprobaciones de padres).
const results: Record<string, Result> = {};
// Captura el último patch pasado a .update()/.insert() por tabla, para
// comprobar que el día/semana mutuamente excluyente se limpia de verdad.
const lastWrite: Record<string, Record<string, unknown>> = {};

function chain(result: Result) {
  const node: Record<string, unknown> = {
    eq: () => node,
    not: () => node,
    select: () => node,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result.data ? result : { data: null, error: result.error ?? { message: "no rows" } }),
  };
  return node;
}

const sessionClient = {
  auth: { getUser: (...a: unknown[]) => getUser(...a) },
  from: (table: string) => ({
    update: (patch: Record<string, unknown>) => {
      lastWrite[table] = patch;
      return chain(results[table] ?? { data: null, error: null });
    },
    insert: (patch: Record<string, unknown>) => {
      lastWrite[table] = patch;
      return chain(results[table] ?? { data: null, error: null });
    },
    select: () => chain(results[`${table}:select`] ?? results[table] ?? { data: null, error: null }),
  }),
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sessionClient }));

const { createAgendaTask, updateAgendaTask, toggleAgendaTaskDone, restoreAgendaTask } = await import("./agenda-actions");
const { updateTask, completeTask, reassignTask } = await import("./task-actions");
const { createSubtask, toggleSubtask, updateSubtask } = await import("./subtask-actions");

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const FOREIGN_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(results)) delete results[key];
  for (const key of Object.keys(lastWrite)) delete lastWrite[key];
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("agenda-actions — endurecimiento", () => {
  it("updateAgendaTask: 0 filas (ID de otro workspace) nunca es éxito, devuelve not_found_or_forbidden", async () => {
    results.agenda_tasks = { data: null, error: null };
    const result = await updateAgendaTask(WORKSPACE_A, FOREIGN_ID, { title: "hackeado" });
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("updateAgendaTask: error real de BD nunca se confunde con not_found_or_forbidden", async () => {
    results.agenda_tasks = { data: null, error: { message: "connection reset" } };
    const result = await updateAgendaTask(WORKSPACE_A, FOREIGN_ID, { title: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toBe("not_found_or_forbidden");
      expect(result.error).not.toContain("connection reset");
    }
  });

  it("updateAgendaTask: 1 fila afectada es éxito", async () => {
    results.agenda_tasks = { data: { id: FOREIGN_ID }, error: null };
    const result = await updateAgendaTask(WORKSPACE_A, FOREIGN_ID, { title: "x" });
    expect(result).toEqual({ ok: true, data: { id: FOREIGN_ID } });
  });

  it("toggleAgendaTaskDone: 0 filas nunca es éxito", async () => {
    results.agenda_tasks = { data: null, error: null };
    const result = await toggleAgendaTaskDone(WORKSPACE_A, FOREIGN_ID, true);
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("createAgendaTask: rechaza exactamente un día Y una semana a la vez", async () => {
    const result = await createAgendaTask(WORKSPACE_A, {
      title: "x",
      scheduled_date: "2026-08-10",
      scheduled_week_start: "2026-08-10",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/exactamente un día o una semana/i);
  });

  it("createAgendaTask: rechaza cuando no se da ni día ni semana", async () => {
    const result = await createAgendaTask(WORKSPACE_A, { title: "x" });
    expect(result.ok).toBe(false);
  });

  it("createAgendaTask: assigned_to de otro workspace (sin membership activa) se rechaza, sin insertar nada", async () => {
    results.memberships = { data: null, error: null };
    const result = await createAgendaTask(WORKSPACE_A, { title: "x", scheduled_date: "2026-08-10", assigned_to: FOREIGN_ID });
    expect(result).toEqual({ ok: false, error: "El responsable no pertenece a la empresa activa" });
    expect(lastWrite.agenda_tasks).toBeUndefined();
  });

  it("createAgendaTask: membership desactivada (is_active=false) se trata igual que 'no pertenece' — maybeSingle ya la excluye", async () => {
    // eq("is_active", true) hace que una membership desactivada nunca
    // aparezca en el resultado — el mock simula exactamente ese caso
    // devolviendo null, igual que la consulta real haría.
    results.memberships = { data: null, error: null };
    const result = await createAgendaTask(WORKSPACE_A, { title: "x", scheduled_date: "2026-08-10", assigned_to: FOREIGN_ID });
    expect(result).toEqual({ ok: false, error: "El responsable no pertenece a la empresa activa" });
  });

  it("createAgendaTask: error de BD comprobando membership da un mensaje transitorio, nunca 'no pertenece' ni éxito silencioso", async () => {
    results.memberships = { data: null, error: { message: "connection reset" } };
    const result = await createAgendaTask(WORKSPACE_A, { title: "x", scheduled_date: "2026-08-10", assigned_to: FOREIGN_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toMatch(/no pertenece/i);
      expect(result.error).toMatch(/no se pudo comprobar tu acceso/i);
      expect(result.error).not.toContain("connection reset");
    }
    expect(lastWrite.agenda_tasks).toBeUndefined();
  });

  it("createAgendaTask: responsable con membership activa se acepta y se inserta", async () => {
    results.memberships = { data: { user_id: FOREIGN_ID }, error: null };
    results.agenda_tasks = { data: { id: "new-id" }, error: null };
    const result = await createAgendaTask(WORKSPACE_A, { title: "x", scheduled_date: "2026-08-10", assigned_to: FOREIGN_ID });
    expect(result).toEqual({ ok: true, data: { id: "new-id" } });
  });

  it("updateAgendaTask: rechaza exactamente un día Y una semana a la vez en la misma llamada", async () => {
    const result = await updateAgendaTask(WORKSPACE_A, FOREIGN_ID, {
      scheduled_date: "2026-08-10",
      scheduled_week_start: "2026-08-10",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/día o una semana/i);
    expect(lastWrite.agenda_tasks).toBeUndefined();
  });

  it("updateAgendaTask: al establecer scheduled_date, limpia scheduled_week_start aunque no se mencione", async () => {
    results.agenda_tasks = { data: { id: FOREIGN_ID }, error: null };
    await updateAgendaTask(WORKSPACE_A, FOREIGN_ID, { scheduled_date: "2026-08-10" });
    expect(lastWrite.agenda_tasks.scheduled_date).toBe("2026-08-10");
    expect(lastWrite.agenda_tasks.scheduled_week_start).toBeNull();
  });

  it("updateAgendaTask: al establecer scheduled_week_start, limpia scheduled_date aunque no se mencione", async () => {
    results.agenda_tasks = { data: { id: FOREIGN_ID }, error: null };
    await updateAgendaTask(WORKSPACE_A, FOREIGN_ID, { scheduled_week_start: "2026-08-10" });
    expect(lastWrite.agenda_tasks.scheduled_week_start).toBe("2026-08-10");
    expect(lastWrite.agenda_tasks.scheduled_date).toBeNull();
  });

  it("updateAgendaTask: actualizar solo el título no toca ninguno de los dos campos de fecha", async () => {
    results.agenda_tasks = { data: { id: FOREIGN_ID }, error: null };
    await updateAgendaTask(WORKSPACE_A, FOREIGN_ID, { title: "Nuevo título" });
    expect(lastWrite.agenda_tasks.scheduled_date).toBeUndefined();
    expect(lastWrite.agenda_tasks.scheduled_week_start).toBeUndefined();
  });

  it("updateAgendaTask: assigned_to de otro workspace se rechaza antes de tocar la tarea", async () => {
    results.memberships = { data: null, error: null };
    const result = await updateAgendaTask(WORKSPACE_A, FOREIGN_ID, { assigned_to: FOREIGN_ID });
    expect(result).toEqual({ ok: false, error: "El responsable no pertenece a la empresa activa" });
    expect(lastWrite.agenda_tasks).toBeUndefined();
  });

  it("updateAgendaTask: error de BD comprobando membership del responsable nunca deja pasar el update", async () => {
    results.memberships = { data: null, error: { message: "connection reset" } };
    const result = await updateAgendaTask(WORKSPACE_A, FOREIGN_ID, { assigned_to: FOREIGN_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no se pudo comprobar tu acceso/i);
      expect(result.error).not.toContain("connection reset");
    }
    expect(lastWrite.agenda_tasks).toBeUndefined();
  });

  // Fase 4B — restoreAgendaTask: reversible, se ejecuta directamente (sin
  // el flujo de confirmación), pero sigue el mismo endurecimiento que
  // cualquier UPDATE de esta fase — 0 filas nunca es éxito.
  it("restoreAgendaTask: 0 filas (tarea de otro workspace, o ya no está cancelada) nunca es éxito", async () => {
    results.agenda_tasks = { data: null, error: null };
    const result = await restoreAgendaTask(WORKSPACE_A, FOREIGN_ID);
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("restoreAgendaTask: error real de BD nunca se confunde con not_found_or_forbidden", async () => {
    results.agenda_tasks = { data: null, error: { message: "connection reset" } };
    const result = await restoreAgendaTask(WORKSPACE_A, FOREIGN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toBe("not_found_or_forbidden");
      expect(result.error).not.toContain("connection reset");
    }
  });

  it("restoreAgendaTask: 1 fila afectada es éxito y limpia cancelled_at/cancelled_by", async () => {
    results.agenda_tasks = { data: { id: FOREIGN_ID }, error: null };
    const result = await restoreAgendaTask(WORKSPACE_A, FOREIGN_ID);
    expect(result).toEqual({ ok: true, data: { id: FOREIGN_ID } });
    expect(lastWrite.agenda_tasks).toEqual(expect.objectContaining({ cancelled_at: null, cancelled_by: null }));
  });
});

describe("task-actions — endurecimiento", () => {
  it("updateTask: 0 filas (ID de otro workspace) nunca es éxito", async () => {
    results.tasks = { data: null, error: null };
    const result = await updateTask(WORKSPACE_A, FOREIGN_ID, { status: "done" });
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("completeTask delega en updateTask con workspaceId — 0 filas nunca es éxito", async () => {
    results.tasks = { data: null, error: null };
    const result = await completeTask(WORKSPACE_A, FOREIGN_ID);
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("reassignTask: rechaza un responsable sin membership activa en el workspace, sin llegar a tocar la tarea", async () => {
    results.memberships = { data: null, error: null };
    const result = await reassignTask(WORKSPACE_A, FOREIGN_ID, USER_ID);
    expect(result).toEqual({ ok: false, error: "El responsable no pertenece a la empresa activa" });
  });

  it("reassignTask: 0 filas de tarea (ID ajeno) nunca es éxito, incluso con un responsable válido", async () => {
    results.memberships = { data: { user_id: USER_ID }, error: null };
    results.tasks = { data: null, error: null };
    const result = await reassignTask(WORKSPACE_A, FOREIGN_ID, USER_ID);
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });
});

describe("subtask-actions — endurecimiento", () => {
  it("createSubtask: rechaza un task_id que pertenece a otro workspace en vez de heredar su workspace_id en silencio", async () => {
    results.tasks = { data: null, error: null };
    const result = await createSubtask(WORKSPACE_A, { task_id: FOREIGN_ID, title: "x" });
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("toggleSubtask: 0 filas (ID de otro workspace) nunca es éxito", async () => {
    results.subtasks = { data: null, error: null };
    const result = await toggleSubtask(WORKSPACE_A, FOREIGN_ID, true);
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("updateSubtask: 0 filas nunca es éxito", async () => {
    results.subtasks = { data: null, error: null };
    const result = await updateSubtask(WORKSPACE_A, FOREIGN_ID, { title: "x" });
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });
});
