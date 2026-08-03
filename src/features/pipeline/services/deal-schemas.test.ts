import { describe, it, expect } from "vitest";
import { DealInputSchema, UpdateDealSchema, ReorderSchema } from "./deal-schemas";

const validContactId = "11111111-1111-4111-8111-111111111111";

describe("DealInputSchema", () => {
  it("accepts a deal linked to an existing contact_id, no lead fields needed", () => {
    const result = DealInputSchema.safeParse({
      contact_id: validContactId,
      title: "Plan Agent AI Max",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an inline lead with just name + phone, no contact_id", () => {
    const result = DealInputSchema.safeParse({
      lead_name: "Antonio Fernández",
      lead_phone: "+34600000000",
      title: "Plan Agent AI Max",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an inline lead with email and sector_name too", () => {
    const result = DealInputSchema.safeParse({
      lead_name: "Antonio Fernández",
      lead_phone: "+34600000000",
      lead_email: "antonio@example.com",
      sector_name: "Dentistas",
      title: "Plan Agent AI Max",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a deal with neither contact_id nor a full inline lead identity", () => {
    const result = DealInputSchema.safeParse({ title: "Plan" });
    expect(result.success).toBe(false);
  });

  it("accepts an inline lead missing the phone — only the name is required", () => {
    const result = DealInputSchema.safeParse({
      lead_name: "Antonio Fernández",
      title: "Plan",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an inline lead with social/contact_method and no phone", () => {
    const result = DealInputSchema.safeParse({
      lead_name: "Antonio Fernández",
      lead_social: "@antonio.ig",
      lead_contact_method: "Prefiere Instagram",
      title: "Plan",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an inline lead missing the name", () => {
    const result = DealInputSchema.safeParse({
      lead_phone: "+34600000000",
      title: "Plan",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed lead_email", () => {
    const result = DealInputSchema.safeParse({
      contact_id: validContactId,
      title: "Plan",
      lead_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative value", () => {
    const result = DealInputSchema.safeParse({
      contact_id: validContactId,
      title: "Plan",
      value: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed expected_close_date", () => {
    const result = DealInputSchema.safeParse({
      contact_id: validContactId,
      title: "Plan",
      expected_close_date: "07/08/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty title", () => {
    const result = DealInputSchema.safeParse({
      contact_id: validContactId,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid contact_id", () => {
    const result = DealInputSchema.safeParse({
      contact_id: "not-a-uuid",
      lead_name: "Antonio",
      lead_phone: "+34600000000",
      title: "Plan",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateDealSchema", () => {
  it("rejects an invalid stage", () => {
    const result = UpdateDealSchema.safeParse({ stage: "archived" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid stage transition", () => {
    const result = UpdateDealSchema.safeParse({ stage: "cliente" });
    expect(result.success).toBe(true);
  });

  it("allows an empty partial update (caller guards against no-op separately)", () => {
    const result = UpdateDealSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("allows a partial update with only sector_name, no identity fields required", () => {
    const result = UpdateDealSchema.safeParse({ sector_name: "Gimnasios" });
    expect(result.success).toBe(true);
  });
});

describe("ReorderSchema", () => {
  it("requires at least one ordered id", () => {
    const result = ReorderSchema.safeParse({ stage: "exploracion", ordered_ids: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid stage", () => {
    const result = ReorderSchema.safeParse({
      stage: "bogus",
      ordered_ids: [validContactId],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid reorder payload", () => {
    const result = ReorderSchema.safeParse({
      stage: "interes",
      ordered_ids: [validContactId],
    });
    expect(result.success).toBe(true);
  });
});
