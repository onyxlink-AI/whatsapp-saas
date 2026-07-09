import { describe, it, expect } from "vitest";
import { CreateTaskSchema, UpdateTaskSchema } from "./task-schemas";

const validId = "11111111-1111-4111-8111-111111111111";

describe("CreateTaskSchema", () => {
  it("requires at least a deal_id or contact_id", () => {
    const result = CreateTaskSchema.safeParse({ title: "Llamar" });
    expect(result.success).toBe(false);
  });

  it("accepts a task linked only to a contact", () => {
    const result = CreateTaskSchema.safeParse({
      contact_id: validId,
      title: "Llamar",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a task linked only to a deal", () => {
    const result = CreateTaskSchema.safeParse({
      deal_id: validId,
      title: "Llamar",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid task_type", () => {
    const result = CreateTaskSchema.safeParse({
      contact_id: validId,
      title: "Llamar",
      task_type: "sms",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateTaskSchema", () => {
  it("rejects an invalid status", () => {
    const result = UpdateTaskSchema.safeParse({ status: "archived" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid status", () => {
    const result = UpdateTaskSchema.safeParse({ status: "done" });
    expect(result.success).toBe(true);
  });
});
