import { describe, it, expect } from "vitest";
import { ScheduleBlockCreateSchema, ScheduleBlockUpdateSchema, ScheduleBlockIdSchema, CONTENT_MAX_LENGTH } from "./schedule-schemas";

const validResponsibleId = "22222222-2222-4222-8222-222222222222";

function validBlock(overrides: Record<string, unknown> = {}) {
  return {
    weekday: 1,
    hour: 9,
    content: "Reunión de equipo",
    color_key: "teal",
    ...overrides,
  };
}

describe("ScheduleBlockCreateSchema", () => {
  it("accepts a minimal valid block", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock());
    expect(result.success).toBe(true);
  });

  it("accepts a full valid block with a responsible", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ responsible_id: validResponsibleId }));
    expect(result.success).toBe(true);
  });

  it("accepts an explicit null responsible_id", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ responsible_id: null }));
    expect(result.success).toBe(true);
  });

  it("rejects weekday 0", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ weekday: 0 }));
    expect(result.success).toBe(false);
  });

  it("rejects weekday 8", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ weekday: 8 }));
    expect(result.success).toBe(false);
  });

  it("accepts the boundary weekdays 1 (lunes) and 7 (domingo)", () => {
    expect(ScheduleBlockCreateSchema.safeParse(validBlock({ weekday: 1 })).success).toBe(true);
    expect(ScheduleBlockCreateSchema.safeParse(validBlock({ weekday: 7 })).success).toBe(true);
  });

  it("rejects hour -1", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ hour: -1 }));
    expect(result.success).toBe(false);
  });

  it("rejects hour 24", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ hour: 24 }));
    expect(result.success).toBe(false);
  });

  it("accepts the boundary hours 0 and 23", () => {
    expect(ScheduleBlockCreateSchema.safeParse(validBlock({ hour: 0 })).success).toBe(true);
    expect(ScheduleBlockCreateSchema.safeParse(validBlock({ hour: 23 })).success).toBe(true);
  });

  it("rejects an empty content", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ content: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects a content that is only whitespace", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ content: "   " }));
    expect(result.success).toBe(false);
  });

  it("rejects content longer than the maximum", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ content: "a".repeat(CONTENT_MAX_LENGTH + 1) }));
    expect(result.success).toBe(false);
  });

  it("accepts content exactly at the maximum length", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ content: "a".repeat(CONTENT_MAX_LENGTH) }));
    expect(result.success).toBe(true);
  });

  it("rejects a color outside the closed palette", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ color_key: "green" }));
    expect(result.success).toBe(false);
  });

  it.each(["teal", "blue", "violet", "amber", "rose", "slate"])("accepts the allowed color %s", (color_key) => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ color_key }));
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid responsible_id", () => {
    const result = ScheduleBlockCreateSchema.safeParse(validBlock({ responsible_id: "not-a-uuid" }));
    expect(result.success).toBe(false);
  });

  it("never accepts raw created_by/updated_by fields — they are simply ignored, never trusted", () => {
    const smuggled: unknown = { ...validBlock(), created_by: "atacante-id", updated_by: "atacante-id" };
    const result = ScheduleBlockCreateSchema.safeParse(smuggled);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("created_by");
      expect(result.data).not.toHaveProperty("updated_by");
    }
  });
});

describe("ScheduleBlockUpdateSchema", () => {
  it("allows a partial update with only content", () => {
    const result = ScheduleBlockUpdateSchema.safeParse({ content: "Nuevo contenido" });
    expect(result.success).toBe(true);
  });

  it("allows a partial update with only color_key", () => {
    const result = ScheduleBlockUpdateSchema.safeParse({ color_key: "rose" });
    expect(result.success).toBe(true);
  });

  it("allows clearing the responsible (nullable)", () => {
    const result = ScheduleBlockUpdateSchema.safeParse({ responsible_id: null });
    expect(result.success).toBe(true);
  });

  it("allows an empty object (the action layer is what rejects an empty update)", () => {
    const result = ScheduleBlockUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data)).toHaveLength(0);
  });

  it("rejects an empty-string content on update too", () => {
    const result = ScheduleBlockUpdateSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  it("rejects weekday 0 and 8 on update too", () => {
    expect(ScheduleBlockUpdateSchema.safeParse({ weekday: 0 }).success).toBe(false);
    expect(ScheduleBlockUpdateSchema.safeParse({ weekday: 8 }).success).toBe(false);
  });

  it("rejects hour -1 and 24 on update too", () => {
    expect(ScheduleBlockUpdateSchema.safeParse({ hour: -1 }).success).toBe(false);
    expect(ScheduleBlockUpdateSchema.safeParse({ hour: 24 }).success).toBe(false);
  });

  it("rejects a non-uuid responsible_id on update too", () => {
    const result = ScheduleBlockUpdateSchema.safeParse({ responsible_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

describe("ScheduleBlockIdSchema", () => {
  it("accepts a valid uuid", () => {
    expect(ScheduleBlockIdSchema.safeParse(validResponsibleId).success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(ScheduleBlockIdSchema.safeParse("42").success).toBe(false);
  });
});
