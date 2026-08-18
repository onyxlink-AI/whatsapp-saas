import { describe, expect, it, vi, beforeEach } from "vitest";

// TAREA 2 — pruebas unitarias de goal-actions.ts con @/lib/supabase/server y
// @/lib/auth/platform-access mockeados (mismo patrón que
// src/lib/auth/platform-access.test.ts). Lo que NO se puede probar con un
// mock — que RLS realmente bloquea a un cliente contra la base de datos real
// — se prueba aparte en agency-goals-isolation.integration.test.ts. Aquí se
// cubre la lógica que vive solo en esta capa: created_by no falsificable,
// period_start/period_end siempre recalculados (nunca del input), y el
// filtro de responsable interno.

const requirePlatformStaff = vi.fn();
vi.mock("@/lib/auth/platform-access", () => ({ requirePlatformStaff: (...args: unknown[]) => requirePlatformStaff(...args) }));

function makeQueryBuilder(finalResult: unknown) {
  const calls: { method: string; args: unknown[] }[] = [];
  const methods = ["select", "eq", "order", "insert", "update", "delete", "single", "maybeSingle"] as const;
  const builder: Record<string, unknown> & { calls: typeof calls; then?: unknown } = { calls };
  for (const m of methods) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      if (m === "single" || m === "maybeSingle") return Promise.resolve(finalResult);
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(finalResult).then(resolve, reject);
  return builder;
}

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: (...args: unknown[]) => createClient(...args) }));

const {
  createGoal,
  updateGoal,
  deleteGoal,
  listGoals,
  listPlatformStaffUsers,
} = await import("./goal-actions");
const { getAnnualPeriod } = await import("./period-calculator");

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";

function mockStaff() {
  requirePlatformStaff.mockResolvedValue({ ok: true, userId: STAFF_ID, email: "staff@onyxlink.local", platformRole: "internal_admin" });
}

function mockUnauthorized() {
  requirePlatformStaff.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("autorización — requirePlatformStaff() se comprueba antes de tocar la base de datos", () => {
  it("listGoals rechaza sin llamar a createClient", async () => {
    mockUnauthorized();
    const result = await listGoals("annual");
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("createGoal rechaza sin llamar a createClient", async () => {
    mockUnauthorized();
    const result = await createGoal({ title: "x", period: { type: "annual", year: 2026 } });
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("updateGoal rechaza sin llamar a createClient", async () => {
    mockUnauthorized();
    const result = await updateGoal(OWNER_ID, { status: "completed" });
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("deleteGoal rechaza sin llamar a createClient", async () => {
    mockUnauthorized();
    const result = await deleteGoal(OWNER_ID);
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("listPlatformStaffUsers rechaza sin llamar a createClient", async () => {
    mockUnauthorized();
    const result = await listPlatformStaffUsers();
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("createGoal", () => {
  it("rechaza título vacío antes de tocar la base de datos (validación Zod)", async () => {
    mockStaff();
    const result = await createGoal({ title: "   ", period: { type: "annual", year: 2026 } });
    expect(result.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("created_by SIEMPRE sale de requirePlatformStaff().userId, nunca del input, ni aunque el input intente falsificarlo", async () => {
    mockStaff();
    const insertBuilder = makeQueryBuilder({ data: { id: "goal-1" }, error: null });
    createClient.mockResolvedValue({ from: () => insertBuilder });

    const forgedInput = { title: "Meta", period: { type: "annual", year: 2026 }, created_by: "atacante-id" };
    const result = await createGoal(forgedInput as unknown as Parameters<typeof createGoal>[0]);

    expect(result.ok).toBe(true);
    const insertCall = insertBuilder.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ created_by: STAFF_ID });
    expect((insertCall?.args[0] as Record<string, unknown>).created_by).not.toBe("atacante-id");
  });

  it("period_start/period_end siempre se recalculan con resolvePeriodBounds, nunca se leen del input", async () => {
    mockStaff();
    const insertBuilder = makeQueryBuilder({ data: { id: "goal-1" }, error: null });
    createClient.mockResolvedValue({ from: () => insertBuilder });

    await createGoal({ title: "Meta anual", period: { type: "annual", year: 2026 } });

    const expected = getAnnualPeriod(2026);
    const insertCall = insertBuilder.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ period_start: expected.start, period_end: expected.end, period_type: "annual" });
  });

  it("rechaza un responsable que no es personal interno de Onyxlink, sin llegar a insertar", async () => {
    mockStaff();
    const usersBuilder = makeQueryBuilder({ data: { platform_role: null, is_super_admin: false }, error: null });
    createClient.mockResolvedValue({ from: () => usersBuilder });

    const result = await createGoal({ title: "Meta", period: { type: "annual", year: 2026 }, owner_id: OWNER_ID });

    expect(result).toEqual({ ok: false, error: "El responsable debe ser personal interno de Onyxlink" });
    expect(usersBuilder.calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("acepta un responsable superadministrador legado (is_super_admin=true, platform_role todavía null)", async () => {
    mockStaff();
    const usersBuilder = makeQueryBuilder({ data: { platform_role: null, is_super_admin: true }, error: null });
    const goalsBuilder = makeQueryBuilder({ data: { id: "goal-1" }, error: null });
    createClient.mockResolvedValue({ from: (table: string) => (table === "users" ? usersBuilder : goalsBuilder) });

    const result = await createGoal({ title: "Meta", period: { type: "annual", year: 2026 }, owner_id: OWNER_ID });

    expect(result.ok).toBe(true);
  });

  it("sin owner_id, no consulta la tabla users en absoluto", async () => {
    mockStaff();
    const calls: string[] = [];
    const goalsBuilder = makeQueryBuilder({ data: { id: "goal-1" }, error: null });
    createClient.mockResolvedValue({
      from: (table: string) => {
        calls.push(table);
        return goalsBuilder;
      },
    });

    await createGoal({ title: "Meta", period: { type: "annual", year: 2026 } });

    expect(calls).not.toContain("users");
  });
});

describe("updateGoal", () => {
  it("solo aplica los campos explícitamente enviados (actualización parcial real)", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: { id: OWNER_ID }, error: null });
    createClient.mockResolvedValue({ from: () => builder });

    await updateGoal(OWNER_ID, { status: "completed" });

    const updateCall = builder.calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toEqual({ status: "completed" });
  });

  it("rechaza cuando no se proporciona ningún campo", async () => {
    mockStaff();
    const result = await updateGoal(OWNER_ID, {});
    expect(result).toEqual({ ok: false, error: "No se proporcionaron campos a actualizar" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rechaza un id de objetivo con formato inválido, sin tocar la base de datos", async () => {
    mockStaff();
    const result = await updateGoal("no-es-un-uuid", { status: "completed" });
    expect(result.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("null limpia explícitamente el responsable, sin pasar por la validación de personal interno", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: { id: OWNER_ID }, error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await updateGoal(OWNER_ID, { owner_id: null });

    expect(result.ok).toBe(true);
    const updateCall = builder.calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toEqual({ owner_id: null });
  });

  it("recalcula period_start/period_end cuando se envía un nuevo periodo", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: { id: OWNER_ID }, error: null });
    createClient.mockResolvedValue({ from: () => builder });

    await updateGoal(OWNER_ID, { period: { type: "monthly", year: 2026, month: 3 } });

    const updateCall = builder.calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ period_type: "monthly", period_start: "2026-03-01", period_end: "2026-03-31" });
  });

  it("devuelve 'no encontrado' cuando el update no afecta ninguna fila", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: null, error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await updateGoal(OWNER_ID, { status: "completed" });
    expect(result).toEqual({ ok: false, error: "Objetivo no encontrado" });
  });
});

describe("deleteGoal", () => {
  it("elimina por id (borrado con conteo, nunca sin filtrar)", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ error: null, count: 1 });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await deleteGoal(OWNER_ID);

    expect(result).toEqual({ ok: true, data: null });
    const eqCall = builder.calls.find((c) => c.method === "eq");
    expect(eqCall?.args).toEqual(["id", OWNER_ID]);
  });

  it("devuelve 'no encontrado' cuando count es 0", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ error: null, count: 0 });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await deleteGoal(OWNER_ID);
    expect(result).toEqual({ ok: false, error: "Objetivo no encontrado" });
  });

  it("rechaza un id con formato inválido sin tocar la base de datos", async () => {
    mockStaff();
    const result = await deleteGoal("no-es-un-uuid");
    expect(result.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("listGoals", () => {
  it("filtra por period_type y ordena por period_start descendente", async () => {
    mockStaff();
    const builder = makeQueryBuilder({ data: [], error: null });
    createClient.mockResolvedValue({ from: () => builder });

    await listGoals("quarterly");

    expect(builder.calls.find((c) => c.method === "eq")?.args).toEqual(["period_type", "quarterly"]);
    expect(builder.calls.find((c) => c.method === "order")?.args).toEqual(["period_start", { ascending: false }]);
  });

  it("normaliza la forma array-u-objeto que PostgREST devuelve para el owner embebido", async () => {
    mockStaff();
    const row = {
      id: "g1", title: "Meta", description: null, period_type: "annual",
      period_start: "2026-01-01", period_end: "2026-12-31", owner_id: OWNER_ID,
      status: "pending", progress: 0, created_by: STAFF_ID,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      owner: [{ id: OWNER_ID, full_name: "Persona Interna" }],
    };
    const builder = makeQueryBuilder({ data: [row], error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await listGoals("annual");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0].owner).toEqual({ id: OWNER_ID, full_name: "Persona Interna" });
  });

  // TAREA 2B, validación adicional: periodType es un parámetro de runtime de
  // una Server Action — el tipado de TypeScript no protege contra una
  // llamada directa con un string arbitrario, así que se rechaza con Zod
  // antes de tocar Supabase.
  it("rechaza un periodType fuera del enum antes de llamar a createClient", async () => {
    mockStaff();
    const result = await listGoals("daily" as unknown as Parameters<typeof listGoals>[0]);
    expect(result).toEqual({ ok: false, error: "Tipo de periodo inválido" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("listPlatformStaffUsers", () => {
  it("filtra a solo personal interno (internal_admin, super_admin, y el superadmin legado) y proyecta id+full_name", async () => {
    mockStaff();
    const rows = [
      { id: "u1", full_name: "Interno", is_super_admin: false, platform_role: "internal_admin" },
      { id: "u2", full_name: "Cliente", is_super_admin: false, platform_role: null },
      { id: "u3", full_name: "Legado", is_super_admin: true, platform_role: null },
    ];
    const builder = makeQueryBuilder({ data: rows, error: null });
    createClient.mockResolvedValue({ from: () => builder });

    const result = await listPlatformStaffUsers();
    expect(result).toEqual({ ok: true, data: [{ id: "u1", full_name: "Interno" }, { id: "u3", full_name: "Legado" }] });
  });
});
