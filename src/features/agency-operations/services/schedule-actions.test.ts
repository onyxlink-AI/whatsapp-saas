import { describe, expect, it, vi, beforeEach } from "vitest";

// TAREA 4A — pruebas unitarias de schedule-actions.ts con
// @/lib/supabase/server y @/lib/auth/platform-access mockeados (mismo
// patrón que src/features/agency-goals/services/goal-actions.test.ts). Lo
// que NO se puede probar con un mock — que RLS y los triggers de Postgres
// realmente bloquean a un cliente contra la base de datos real — se prueba
// aparte en agency-schedule-isolation.integration.test.ts. Aquí se cubre la
// lógica que vive solo en esta capa: autorización antes de tocar Supabase,
// created_by/updated_by nunca proceden del input, el filtro de responsable
// interno activo, y la traducción del conflicto UNIQUE (weekday, hour).

const requirePlatformStaff = vi.fn();
vi.mock("@/lib/auth/platform-access", () => ({ requirePlatformStaff: (...args: unknown[]) => requirePlatformStaff(...args) }));

// `results` acepta un único resultado fijo (comportamiento de siempre: toda
// llamada terminal `.single()`/`.maybeSingle()` resuelve igual) o un array,
// consumido en orden para simular VARIAS llamadas distintas sobre la MISMA
// tabla — necesario desde TAREA 4A.1 porque updateScheduleBlock ahora puede
// leer agency_schedule_blocks dos veces (responsable actual, luego el
// UPDATE) antes de devolver un resultado.
function makeQueryBuilder(results: unknown | unknown[]) {
  const queue = Array.isArray(results) ? [...results] : null;
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> & { calls: typeof calls; then?: unknown } = { calls };
  const methods = ["select", "eq", "order", "insert", "update", "delete", "single", "maybeSingle"] as const;
  const nextResult = () => (queue ? (queue.length > 1 ? queue.shift() : queue[0]) : results);
  for (const m of methods) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      if (m === "single" || m === "maybeSingle") return Promise.resolve(nextResult());
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(nextResult()).then(resolve, reject);
  return builder;
}

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: (...args: unknown[]) => createClient(...args) }));

const { createScheduleBlock, updateScheduleBlock, deleteScheduleBlock, listScheduleBlocks, listScheduleResponsibles } = await import(
  "./schedule-actions"
);

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const BLOCK_ID = "33333333-3333-4333-8333-333333333333";
const RESPONSIBLE_ID = "22222222-2222-4222-8222-222222222222";

function mockStaff() {
  requirePlatformStaff.mockResolvedValue({ ok: true, userId: STAFF_ID, email: "staff@onyxlink.local", platformRole: "internal_admin" });
}

function mockUnauthorized() {
  requirePlatformStaff.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
}

function validInput(overrides: Partial<Parameters<typeof createScheduleBlock>[0]> = {}): Parameters<typeof createScheduleBlock>[0] {
  return { weekday: 1, hour: 9, content: "Reunión de equipo", color_key: "teal", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("autorización — requirePlatformStaff() se comprueba antes de tocar la base de datos", () => {
  it("listScheduleBlocks rechaza sin llamar a createClient", async () => {
    mockUnauthorized();
    const result = await listScheduleBlocks();
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("createScheduleBlock rechaza sin llamar a createClient", async () => {
    mockUnauthorized();
    const result = await createScheduleBlock(validInput());
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("updateScheduleBlock rechaza sin llamar a createClient", async () => {
    mockUnauthorized();
    const result = await updateScheduleBlock(BLOCK_ID, { content: "x" });
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("deleteScheduleBlock rechaza sin llamar a createClient", async () => {
    mockUnauthorized();
    const result = await deleteScheduleBlock(BLOCK_ID);
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("listScheduleResponsibles rechaza sin llamar a createClient", async () => {
    mockUnauthorized();
    const result = await listScheduleResponsibles();
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TAREA 4B — listScheduleResponsibles: directorio de responsables ACTIVOS
// para el selector del formulario. No confundir con listPlatformStaffUsers()
// de Objetivos (goal-actions.ts) — esa acción no filtra por is_active porque
// Objetivos no lo necesita; esta sí, y son dos funciones independientes.
// ──────────────────────────────────────────────────────────────────────────────
describe("listScheduleResponsibles", () => {
  const CLIENT_ROW = { id: "c1", full_name: "Cliente Normal", is_super_admin: false, platform_role: null, is_active: true };
  const INACTIVE_INTERNAL_ROW = { id: "i1", full_name: "Interno Inactivo", is_super_admin: false, platform_role: "internal_admin", is_active: false };
  const ACTIVE_INTERNAL_ROW = { id: "i2", full_name: "Interno Activo", is_super_admin: false, platform_role: "internal_admin", is_active: true };
  const ACTIVE_SUPERADMIN_ROW = { id: "s1", full_name: "Super Activo", is_super_admin: false, platform_role: "super_admin", is_active: true };
  const ACTIVE_LEGACY_ROW = { id: "l1", full_name: "Legado Activo", is_super_admin: true, platform_role: null, is_active: true };
  const INACTIVE_LEGACY_ROW = { id: "l2", full_name: "Legado Inactivo", is_super_admin: true, platform_role: null, is_active: false };

  it("excluye clientes (platform_role null, is_super_admin false)", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: [CLIENT_ROW], error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await listScheduleResponsibles();
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("excluye personal inactivo, tanto internal_admin/super_admin como el superadministrador legado", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: [INACTIVE_INTERNAL_ROW, INACTIVE_LEGACY_ROW], error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await listScheduleResponsibles();
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("incluye internal_admin activo", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: [ACTIVE_INTERNAL_ROW], error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await listScheduleResponsibles();
    expect(result).toEqual({ ok: true, data: [{ id: "i2", full_name: "Interno Activo" }] });
  });

  it("incluye super_admin activo", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: [ACTIVE_SUPERADMIN_ROW], error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await listScheduleResponsibles();
    expect(result).toEqual({ ok: true, data: [{ id: "s1", full_name: "Super Activo" }] });
  });

  it("incluye al superadministrador legado activo (is_super_admin=true, platform_role todavía null)", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: [ACTIVE_LEGACY_ROW], error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await listScheduleResponsibles();
    expect(result).toEqual({ ok: true, data: [{ id: "l1", full_name: "Legado Activo" }] });
  });

  it("ordena por full_name y proyecta únicamente id+full_name, filtrando cliente/inactivo del mismo lote", async () => {
    mockStaff();
    const rows = [ACTIVE_INTERNAL_ROW, CLIENT_ROW, ACTIVE_SUPERADMIN_ROW, INACTIVE_INTERNAL_ROW, ACTIVE_LEGACY_ROW];
    const builder = makeQueryBuilder({ data: rows, error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await listScheduleResponsibles();

    expect(builder.calls.find((c) => c.method === "order")?.args).toEqual(["full_name", { ascending: true }]);
    expect(result).toEqual({
      ok: true,
      data: [
        { id: "i2", full_name: "Interno Activo" },
        { id: "s1", full_name: "Super Activo" },
        { id: "l1", full_name: "Legado Activo" },
      ],
    });
  });

  // TAREA 4B.1: is_active=true ya se filtra en la propia consulta SQL — el
  // filtro en memoria de arriba es una segunda barrera, nunca la única.
  it("filtra is_active=true directamente en la consulta a Supabase (.eq), no solo en memoria", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: [ACTIVE_INTERNAL_ROW], error: null });
    createClient.mockResolvedValue({ from: () => builder });

    await listScheduleResponsibles();

    expect(builder.calls.find((c) => c.method === "eq")?.args).toEqual(["is_active", true]);
  });

  it("devuelve un error comprensible cuando falla la consulta a Supabase", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: null, error: { message: "db down" } });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await listScheduleResponsibles();
    expect(result).toEqual({ ok: false, error: "Error al cargar el personal interno" });
  });
});

describe("createScheduleBlock", () => {
  it("rechaza contenido vacío antes de tocar la base de datos (validación Zod)", async () => {
    mockStaff();
    const result = await createScheduleBlock(validInput({ content: "   " }));
    expect(result.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("created_by/updated_by nunca proceden del input, ni aunque el input intente falsificarlos: la Server Action jamás los incluye en el INSERT", async () => {
    mockStaff();
    const insertBuilder = makeQueryBuilder({ data: { id: "block-1" }, error: null });
    createClient.mockResolvedValue({ from: () => insertBuilder });

    const forgedInput = { ...validInput(), created_by: "atacante-id", updated_by: "atacante-id" };
    const result = await createScheduleBlock(forgedInput as unknown as Parameters<typeof createScheduleBlock>[0]);

    expect(result.ok).toBe(true);
    const insertCall = insertBuilder.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).not.toHaveProperty("created_by");
    expect(insertCall?.args[0]).not.toHaveProperty("updated_by");
  });

  it("rechaza un responsable que no es personal interno de Onyxlink, sin llegar a insertar", async () => {
    mockStaff();
    const usersBuilder = makeQueryBuilder({ data: { platform_role: null, is_super_admin: false, is_active: true }, error: null });
    createClient.mockResolvedValue({ from: () => usersBuilder });

    const result = await createScheduleBlock(validInput({ responsible_id: RESPONSIBLE_ID }));

    expect(result).toEqual({ ok: false, error: "El responsable debe ser personal interno activo de Onyxlink" });
    expect(usersBuilder.calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("rechaza un responsable interno pero inactivo", async () => {
    mockStaff();
    const usersBuilder = makeQueryBuilder({ data: { platform_role: "internal_admin", is_super_admin: false, is_active: false }, error: null });
    createClient.mockResolvedValue({ from: () => usersBuilder });

    const result = await createScheduleBlock(validInput({ responsible_id: RESPONSIBLE_ID }));

    expect(result).toEqual({ ok: false, error: "El responsable debe ser personal interno activo de Onyxlink" });
  });

  it("acepta un responsable interno activo", async () => {
    mockStaff();
    const usersBuilder = makeQueryBuilder({ data: { platform_role: "internal_admin", is_super_admin: false, is_active: true }, error: null });
    const blocksBuilder = makeQueryBuilder({ data: { id: "block-1" }, error: null });
    createClient.mockResolvedValue({ from: (table: string) => (table === "users" ? usersBuilder : blocksBuilder) });

    const result = await createScheduleBlock(validInput({ responsible_id: RESPONSIBLE_ID }));

    expect(result.ok).toBe(true);
  });

  it("acepta un responsable superadministrador legado activo (is_super_admin=true, platform_role todavía null)", async () => {
    mockStaff();
    const usersBuilder = makeQueryBuilder({ data: { platform_role: null, is_super_admin: true, is_active: true }, error: null });
    const blocksBuilder = makeQueryBuilder({ data: { id: "block-1" }, error: null });
    createClient.mockResolvedValue({ from: (table: string) => (table === "users" ? usersBuilder : blocksBuilder) });

    const result = await createScheduleBlock(validInput({ responsible_id: RESPONSIBLE_ID }));

    expect(result.ok).toBe(true);
  });

  it("responsable null: aceptado sin consultar la tabla users en absoluto", async () => {
    mockStaff();
    const calls: string[] = [];
    const blocksBuilder = makeQueryBuilder({ data: { id: "block-1" }, error: null });
    createClient.mockResolvedValue({
      from: (table: string) => {
        calls.push(table);
        return blocksBuilder;
      },
    });

    const result = await createScheduleBlock(validInput({ responsible_id: null }));

    expect(result.ok).toBe(true);
    expect(calls).not.toContain("users");
    const insertCall = blocksBuilder.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ responsible_id: null });
  });

  it("convierte el conflicto UNIQUE (weekday, hour) en un mensaje comprensible", async () => {
    mockStaff();
    const insertBuilder = makeQueryBuilder({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "uq_agency_schedule_blocks_weekday_hour"' },
    });
    createClient.mockResolvedValue({ from: () => insertBuilder });

    const result = await createScheduleBlock(validInput());

    expect(result).toEqual({ ok: false, error: "Ya existe un bloque de horario para ese día y esa hora" });
  });
});

describe("updateScheduleBlock", () => {
  it("solo aplica los campos explícitamente enviados (actualización parcial real)", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: { id: BLOCK_ID }, error: null });
    createClient.mockResolvedValue({ from: () => builder });

    await updateScheduleBlock(BLOCK_ID, { content: "Nuevo contenido" });

    const updateCall = builder.calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toEqual({ content: "Nuevo contenido" });
  });

  it("rechaza cuando no se proporciona ningún campo", async () => {
    mockStaff();
    const result = await updateScheduleBlock(BLOCK_ID, {});
    expect(result).toEqual({ ok: false, error: "No se proporcionaron campos a actualizar" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rechaza un id de bloque con formato inválido, sin tocar la base de datos", async () => {
    mockStaff();
    const result = await updateScheduleBlock("no-es-un-uuid", { content: "x" });
    expect(result.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("null limpia explícitamente el responsable, sin pasar por la validación de personal interno", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: { id: BLOCK_ID }, error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await updateScheduleBlock(BLOCK_ID, { responsible_id: null });

    expect(result.ok).toBe(true);
    const updateCall = builder.calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toEqual({ responsible_id: null });
  });

  it("rechaza un responsable que no es personal interno activo, sin llegar a actualizar", async () => {
    mockStaff();
    // El bloque ya tenía otro responsable (null aquí) — RESPONSIBLE_ID es una
    // asignación NUEVA para esta fila, así que sí debe validarse.
    const blocksBuilder = makeQueryBuilder({ data: { responsible_id: null }, error: null });
    const usersBuilder = makeQueryBuilder({ data: { platform_role: null, is_super_admin: false, is_active: true }, error: null });
    createClient.mockResolvedValue({ from: (table: string) => (table === "users" ? usersBuilder : blocksBuilder) });

    const result = await updateScheduleBlock(BLOCK_ID, { responsible_id: RESPONSIBLE_ID });

    expect(result).toEqual({ ok: false, error: "El responsable debe ser personal interno activo de Onyxlink" });
    expect(blocksBuilder.calls.some((c) => c.method === "update")).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────────
  // TAREA 4A.1 — responsable histórico: responsible_id no nulo solo exige
  // "personal interno activo" cuando es una asignación NUEVA (distinta de la
  // que la fila ya tenía). Mismo criterio que el trigger de Postgres
  // enforce_agency_schedule_blocks_responsible_is_staff — implementado aquí
  // sin depender de que la futura interfaz envíe un patch mínimo.
  // ────────────────────────────────────────────────────────────────────────
  describe("TAREA 4A.1 — responsable histórico no se revalida si no cambia", () => {
    it("editar contenido enviando también el mismo responsible_id histórico no consulta users ni rechaza la actualización", async () => {
      mockStaff();
      const tableCalls: string[] = [];
      const blocksBuilder = makeQueryBuilder([
        { data: { responsible_id: RESPONSIBLE_ID }, error: null }, // lectura previa del responsable actual
        { data: { id: BLOCK_ID }, error: null }, // UPDATE final
      ]);
      const usersBuilder = makeQueryBuilder({ data: null, error: null });
      createClient.mockResolvedValue({
        from: (table: string) => {
          tableCalls.push(table);
          return table === "users" ? usersBuilder : blocksBuilder;
        },
      });

      const result = await updateScheduleBlock(BLOCK_ID, { content: "Contenido editado", responsible_id: RESPONSIBLE_ID });

      expect(result).toEqual({ ok: true, data: { id: BLOCK_ID } });
      expect(tableCalls).not.toContain("users");
      const updateCall = blocksBuilder.calls.find((c) => c.method === "update");
      expect(updateCall?.args[0]).toEqual({ content: "Contenido editado", responsible_id: RESPONSIBLE_ID });
    });

    it("cambiar a otro responsable exige que el nuevo sea personal interno activo: rechaza si no lo es", async () => {
      mockStaff();
      const OTHER_RESPONSIBLE_ID = "44444444-4444-4444-8444-444444444444";
      const blocksBuilder = makeQueryBuilder({ data: { responsible_id: RESPONSIBLE_ID }, error: null });
      const usersBuilder = makeQueryBuilder({ data: { platform_role: null, is_super_admin: false, is_active: true }, error: null });
      createClient.mockResolvedValue({ from: (table: string) => (table === "users" ? usersBuilder : blocksBuilder) });

      const result = await updateScheduleBlock(BLOCK_ID, { responsible_id: OTHER_RESPONSIBLE_ID });

      expect(result).toEqual({ ok: false, error: "El responsable debe ser personal interno activo de Onyxlink" });
      expect(blocksBuilder.calls.some((c) => c.method === "update")).toBe(false);
    });

    it("cambiar a otro responsable exige que el nuevo sea personal interno activo: acepta si lo es", async () => {
      mockStaff();
      const OTHER_RESPONSIBLE_ID = "44444444-4444-4444-8444-444444444444";
      const blocksBuilder = makeQueryBuilder([
        { data: { responsible_id: RESPONSIBLE_ID }, error: null },
        { data: { id: BLOCK_ID }, error: null },
      ]);
      const usersBuilder = makeQueryBuilder({ data: { platform_role: "internal_admin", is_super_admin: false, is_active: true }, error: null });
      createClient.mockResolvedValue({ from: (table: string) => (table === "users" ? usersBuilder : blocksBuilder) });

      const result = await updateScheduleBlock(BLOCK_ID, { responsible_id: OTHER_RESPONSIBLE_ID });

      expect(result).toEqual({ ok: true, data: { id: BLOCK_ID } });
    });

    it("responsible_id null sigue desasignando sin pasar por esta comprobación", async () => {
      mockStaff();
      const tableCalls: string[] = [];
      const blocksBuilder = makeQueryBuilder({ data: { id: BLOCK_ID }, error: null });
      createClient.mockResolvedValue({
        from: (table: string) => {
          tableCalls.push(table);
          return blocksBuilder;
        },
      });

      const result = await updateScheduleBlock(BLOCK_ID, { responsible_id: null });

      expect(result).toEqual({ ok: true, data: { id: BLOCK_ID } });
      expect(tableCalls).not.toContain("users");
      const updateCall = blocksBuilder.calls.find((c) => c.method === "update");
      expect(updateCall?.args[0]).toEqual({ responsible_id: null });
    });

    it("un bloque inexistente se gestiona correctamente durante la comprobación de responsable: 'no encontrado', sin consultar users ni actualizar", async () => {
      mockStaff();
      const tableCalls: string[] = [];
      const blocksBuilder = makeQueryBuilder({ data: null, error: null });
      const usersBuilder = makeQueryBuilder({ data: null, error: null });
      createClient.mockResolvedValue({
        from: (table: string) => {
          tableCalls.push(table);
          return table === "users" ? usersBuilder : blocksBuilder;
        },
      });

      const result = await updateScheduleBlock(BLOCK_ID, { responsible_id: RESPONSIBLE_ID });

      expect(result).toEqual({ ok: false, error: "Bloque de horario no encontrado" });
      expect(tableCalls).not.toContain("users");
      expect(blocksBuilder.calls.some((c) => c.method === "update")).toBe(false);
    });
  });

  it("devuelve 'no encontrado' cuando el update no afecta ninguna fila", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: null, error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await updateScheduleBlock(BLOCK_ID, { content: "x" });
    expect(result).toEqual({ ok: false, error: "Bloque de horario no encontrado" });
  });

  it("convierte el conflicto UNIQUE (weekday, hour) en un mensaje comprensible al mover un bloque a una celda ocupada", async () => {
    mockStaff();
    const builder = makeQueryBuilder({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "uq_agency_schedule_blocks_weekday_hour"' },
    });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await updateScheduleBlock(BLOCK_ID, { weekday: 2, hour: 10 });

    expect(result).toEqual({ ok: false, error: "Ya existe un bloque de horario para ese día y esa hora" });
  });
});

describe("deleteScheduleBlock", () => {
  it("elimina por id (borrado con conteo, nunca sin filtrar)", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ error: null, count: 1 });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await deleteScheduleBlock(BLOCK_ID);

    expect(result).toEqual({ ok: true, data: null });
    const eqCall = builder.calls.find((c) => c.method === "eq");
    expect(eqCall?.args).toEqual(["id", BLOCK_ID]);
  });

  it("devuelve 'no encontrado' cuando count es 0", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ error: null, count: 0 });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await deleteScheduleBlock(BLOCK_ID);
    expect(result).toEqual({ ok: false, error: "Bloque de horario no encontrado" });
  });

  it("rechaza un id con formato inválido sin tocar la base de datos", async () => {
    mockStaff();
    const result = await deleteScheduleBlock("no-es-un-uuid");
    expect(result.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("listScheduleBlocks", () => {
  it("ordena por weekday y luego por hour, ambos ascendentes", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: [], error: null });
    createClient.mockResolvedValue({ from: () => builder });

    await listScheduleBlocks();

    const orderCalls = builder.calls.filter((c) => c.method === "order");
    expect(orderCalls[0]?.args).toEqual(["weekday", { ascending: true }]);
    expect(orderCalls[1]?.args).toEqual(["hour", { ascending: true }]);
  });

  it("normaliza la forma array-u-objeto que PostgREST devuelve para el responsible embebido", async () => {
    mockStaff();
    const row = {
      id: BLOCK_ID,
      weekday: 1,
      hour: 9,
      content: "Reunión",
      color_key: "teal",
      responsible_id: RESPONSIBLE_ID,
      created_by: STAFF_ID,
      updated_by: STAFF_ID,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      responsible: [{ id: RESPONSIBLE_ID, full_name: "Persona Interna" }],
    };
    const builder = makeQueryBuilder({ data: [row], error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await listScheduleBlocks();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0].responsible).toEqual({ id: RESPONSIBLE_ID, full_name: "Persona Interna" });
  });
});
