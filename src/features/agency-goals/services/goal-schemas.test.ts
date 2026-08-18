import { describe, it, expect } from "vitest";
import { GoalCreateSchema, GoalUpdateSchema, GoalIdSchema, PeriodSelectorSchema } from "./goal-schemas";

const validOwnerId = "22222222-2222-4222-8222-222222222222";

describe("GoalCreateSchema", () => {
  it("accepts a minimal valid annual goal", () => {
    const result = GoalCreateSchema.safeParse({
      title: "Facturación anual 2026",
      period: { type: "annual", year: 2026 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a full valid weekly goal", () => {
    const result = GoalCreateSchema.safeParse({
      title: "Cerrar 5 clientes nuevos",
      description: "Semana de captación",
      period: { type: "weekly", referenceDate: "2026-03-16" },
      owner_id: validOwnerId,
      status: "in_progress",
      progress: 40,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = GoalCreateSchema.safeParse({ title: "", period: { type: "annual", year: 2026 } });
    expect(result.success).toBe(false);
  });

  it("rejects a title that is only whitespace", () => {
    const result = GoalCreateSchema.safeParse({ title: "   ", period: { type: "annual", year: 2026 } });
    expect(result.success).toBe(false);
  });

  it("rejects progress below 0", () => {
    const result = GoalCreateSchema.safeParse({
      title: "Objetivo",
      period: { type: "annual", year: 2026 },
      progress: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects progress above 100", () => {
    const result = GoalCreateSchema.safeParse({
      title: "Objetivo",
      period: { type: "annual", year: 2026 },
      progress: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer progress", () => {
    const result = GoalCreateSchema.safeParse({
      title: "Objetivo",
      period: { type: "annual", year: 2026 },
      progress: 50.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid status", () => {
    const result = GoalCreateSchema.safeParse({
      title: "Objetivo",
      period: { type: "annual", year: 2026 },
      status: "archived",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid owner_id", () => {
    const result = GoalCreateSchema.safeParse({
      title: "Objetivo",
      period: { type: "annual", year: 2026 },
      owner_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a quarter outside 1-4", () => {
    const result = PeriodSelectorSchema.safeParse({ type: "quarterly", year: 2026, quarter: 5 });
    expect(result.success).toBe(false);
  });

  it("rejects a month outside 1-12", () => {
    const result = PeriodSelectorSchema.safeParse({ type: "monthly", year: 2026, month: 13 });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown period type", () => {
    const result = PeriodSelectorSchema.safeParse({ type: "biannual", year: 2026 });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed reference date for weekly period", () => {
    const result = PeriodSelectorSchema.safeParse({ type: "weekly", referenceDate: "16/03/2026" });
    expect(result.success).toBe(false);
  });

  // TAREA 2B, problema 4: la regex sola aceptaba fechas de calendario que no
  // existen porque el constructor Date de JS las normaliza en silencio
  // (2026-02-31 -> 2026-03-03) en vez de fallar.
  it.each(["2026-02-31", "2025-02-29", "2026-13-10", "2026-00-10"])(
    "rejects the impossible calendar date %s for weekly period",
    (referenceDate) => {
      const result = PeriodSelectorSchema.safeParse({ type: "weekly", referenceDate });
      expect(result.success).toBe(false);
    },
  );

  it("accepts 2024-02-29 (real leap day) for weekly period", () => {
    const result = PeriodSelectorSchema.safeParse({ type: "weekly", referenceDate: "2024-02-29" });
    expect(result.success).toBe(true);
  });

  it("never accepts raw period_start/period_end fields — they are simply ignored, never trusted", () => {
    // Simula un cliente intentando colar fechas exactas directamente — el
    // schema no las declara en absoluto, así que Zod las descarta.
    const smuggled: unknown = {
      title: "Objetivo",
      period: { type: "annual", year: 2026 },
      period_start: "1999-01-01",
      period_end: "1999-01-01",
    };
    const result = GoalCreateSchema.safeParse(smuggled);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("period_start");
      expect(result.data).not.toHaveProperty("period_end");
    }
  });
});

describe("GoalUpdateSchema", () => {
  it("allows a partial update with only status", () => {
    const result = GoalUpdateSchema.safeParse({ status: "completed" });
    expect(result.success).toBe(true);
  });

  it("allows a partial update with only progress", () => {
    const result = GoalUpdateSchema.safeParse({ progress: 75 });
    expect(result.success).toBe(true);
  });

  it("allows clearing the owner (nullable)", () => {
    const result = GoalUpdateSchema.safeParse({ owner_id: null });
    expect(result.success).toBe(true);
  });

  it("rejects an empty-string title on update too", () => {
    const result = GoalUpdateSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });
});

describe("GoalIdSchema", () => {
  it("accepts a valid uuid", () => {
    expect(GoalIdSchema.safeParse(validOwnerId).success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(GoalIdSchema.safeParse("42").success).toBe(false);
  });
});
