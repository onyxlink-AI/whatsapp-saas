import { describe, it, expect } from "vitest";
import { buildHelpAssistantSystemPrompt, REFUSAL_MESSAGE } from "./system-prompt";

describe("buildHelpAssistantSystemPrompt", () => {
  const prompt = buildHelpAssistantSystemPrompt();

  it("contains the exact refusal message", () => {
    expect(prompt).toContain(REFUSAL_MESSAGE);
  });

  it("documents the key panel routes so answers stay accurate", () => {
    expect(prompt).toContain("/clientes");
    expect(prompt).toContain("/pipeline");
    expect(prompt).toContain("/settings?tab=actividad");
    expect(prompt).toContain("/settings?tab=integraciones");
  });

  it("instructs brief, concise answers", () => {
    expect(prompt).toMatch(/BREVES/);
  });

  it("instructs refusing off-topic and jailbreak attempts", () => {
    expect(prompt).toMatch(/ignores estas instrucciones/);
  });
});
