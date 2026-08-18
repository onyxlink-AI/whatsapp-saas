import { describe, it, expect } from "vitest";
import {
  RelationshipCreateSchema,
  RelationshipUpdateSchema,
  RelationshipIdSchema,
  MeetingCreateSchema,
  MeetingIdSchema,
} from "./kpi-schemas";

const validWorkspaceId = "11111111-1111-4111-8111-111111111111";

describe("RelationshipCreateSchema", () => {
  it("accepts a minimal valid relationship (no end date, no fee)", () => {
    const result = RelationshipCreateSchema.safeParse({ workspace_id: validWorkspaceId, service_started_on: "2026-01-01" });
    expect(result.success).toBe(true);
  });

  it("accepts a full valid relationship", () => {
    const result = RelationshipCreateSchema.safeParse({
      workspace_id: validWorkspaceId,
      service_started_on: "2026-01-01",
      service_ended_on: "2026-06-01",
      monthly_fee: 199.99,
    });
    expect(result.success).toBe(true);
  });

  it("rejects service_ended_on anterior a service_started_on", () => {
    const result = RelationshipCreateSchema.safeParse({
      workspace_id: validWorkspaceId,
      service_started_on: "2026-06-01",
      service_ended_on: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative monthly_fee", () => {
    const result = RelationshipCreateSchema.safeParse({
      workspace_id: validWorkspaceId,
      service_started_on: "2026-01-01",
      monthly_fee: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts monthly_fee of exactly 0", () => {
    const result = RelationshipCreateSchema.safeParse({
      workspace_id: validWorkspaceId,
      service_started_on: "2026-01-01",
      monthly_fee: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid workspace_id", () => {
    const result = RelationshipCreateSchema.safeParse({ workspace_id: "not-a-uuid", service_started_on: "2026-01-01" });
    expect(result.success).toBe(false);
  });

  it.each(["2026-02-31", "2025-02-29", "2026-13-10", "2026-00-10"])(
    "rejects the impossible calendar date %s as service_started_on",
    (service_started_on) => {
      const result = RelationshipCreateSchema.safeParse({ workspace_id: validWorkspaceId, service_started_on });
      expect(result.success).toBe(false);
    },
  );

  it("accepts 2024-02-29 (real leap day) as service_started_on", () => {
    const result = RelationshipCreateSchema.safeParse({ workspace_id: validWorkspaceId, service_started_on: "2024-02-29" });
    expect(result.success).toBe(true);
  });
});

describe("RelationshipUpdateSchema", () => {
  it("allows a partial update with only monthly_fee", () => {
    expect(RelationshipUpdateSchema.safeParse({ monthly_fee: 250 }).success).toBe(true);
  });

  it("allows clearing monthly_fee (nullable)", () => {
    expect(RelationshipUpdateSchema.safeParse({ monthly_fee: null }).success).toBe(true);
  });

  it("allows finalizing a relationship with only service_ended_on", () => {
    expect(RelationshipUpdateSchema.safeParse({ service_ended_on: "2026-06-01" }).success).toBe(true);
  });

  it("rejects service_ended_on before service_started_on when both are provided together", () => {
    const result = RelationshipUpdateSchema.safeParse({ service_started_on: "2026-06-01", service_ended_on: "2026-01-01" });
    expect(result.success).toBe(false);
  });
});

describe("RelationshipIdSchema", () => {
  it("accepts a valid uuid", () => {
    expect(RelationshipIdSchema.safeParse(validWorkspaceId).success).toBe(true);
  });
  it("rejects a non-uuid id", () => {
    expect(RelationshipIdSchema.safeParse("42").success).toBe(false);
  });
});

describe("MeetingCreateSchema — combinaciones válidas de status/outcome", () => {
  it("scheduled sin outcome: aceptado", () => {
    const result = MeetingCreateSchema.safeParse({ lead_name: "Lead 1", scheduled_at: "2026-08-20T10:00:00.000Z", status: "scheduled" });
    expect(result.success).toBe(true);
  });

  it("held con outcome won: aceptado", () => {
    const result = MeetingCreateSchema.safeParse({
      lead_name: "Lead 1",
      scheduled_at: "2026-08-20T10:00:00.000Z",
      status: "held",
      outcome: "won",
    });
    expect(result.success).toBe(true);
  });

  it("held con outcome lost: aceptado", () => {
    const result = MeetingCreateSchema.safeParse({
      lead_name: "Lead 1",
      scheduled_at: "2026-08-20T10:00:00.000Z",
      status: "held",
      outcome: "lost",
    });
    expect(result.success).toBe(true);
  });

  it("held con outcome pending: aceptado", () => {
    const result = MeetingCreateSchema.safeParse({
      lead_name: "Lead 1",
      scheduled_at: "2026-08-20T10:00:00.000Z",
      status: "held",
      outcome: "pending",
    });
    expect(result.success).toBe(true);
  });

  it("held sin outcome: rechazado", () => {
    const result = MeetingCreateSchema.safeParse({ lead_name: "Lead 1", scheduled_at: "2026-08-20T10:00:00.000Z", status: "held" });
    expect(result.success).toBe(false);
  });

  it.each(["scheduled", "cancelled", "no_show"] as const)("%s con un outcome informado: rechazado", (status) => {
    const result = MeetingCreateSchema.safeParse({
      lead_name: "Lead 1",
      scheduled_at: "2026-08-20T10:00:00.000Z",
      status,
      outcome: "won",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un nombre de lead vacío", () => {
    const result = MeetingCreateSchema.safeParse({ lead_name: "", scheduled_at: "2026-08-20T10:00:00.000Z", status: "scheduled" });
    expect(result.success).toBe(false);
  });

  it("rechaza un status desconocido", () => {
    const result = MeetingCreateSchema.safeParse({ lead_name: "Lead 1", scheduled_at: "2026-08-20T10:00:00.000Z", status: "postponed" });
    expect(result.success).toBe(false);
  });

  it("rechaza una fecha/hora no ISO", () => {
    const result = MeetingCreateSchema.safeParse({ lead_name: "Lead 1", scheduled_at: "20/08/2026 10:00", status: "scheduled" });
    expect(result.success).toBe(false);
  });
});

describe("MeetingIdSchema", () => {
  it("accepts a valid uuid", () => {
    expect(MeetingIdSchema.safeParse(validWorkspaceId).success).toBe(true);
  });
  it("rejects a non-uuid id", () => {
    expect(MeetingIdSchema.safeParse("42").success).toBe(false);
  });
});
