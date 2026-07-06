import { describe, it, expect } from "vitest";
import { isValidIanaTimezone } from "./timezone";

describe("isValidIanaTimezone", () => {
  it("accepts real IANA identifiers", () => {
    expect(isValidIanaTimezone("Europe/Madrid")).toBe(true);
    expect(isValidIanaTimezone("America/Mexico_City")).toBe(true);
    expect(isValidIanaTimezone("UTC")).toBe(true);
  });

  it("rejects the exact free-text value that broke Google Calendar in production (Issue 3)", () => {
    expect(isValidIanaTimezone("Zona horaria de Madrid (GMT+2)")).toBe(false);
  });

  it("rejects empty strings and garbage", () => {
    expect(isValidIanaTimezone("")).toBe(false);
    expect(isValidIanaTimezone("not a timezone")).toBe(false);
    expect(isValidIanaTimezone("GMT+2")).toBe(false);
  });
});
