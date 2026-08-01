import { describe, it, expect } from "vitest";
import { buildHelpAssistantSystemPrompt, REFUSAL_MESSAGE } from "./system-prompt";
import type { HelpAssistantPlanContext } from "../types";

const fullPlan: HelpAssistantPlanContext = {
  gestionEnabled: true,
  whatsappAgentEnabled: true,
  officeVirtualEnabled: true,
  hasVoiceAgent: true,
};

const gestionOnlyPlan: HelpAssistantPlanContext = {
  gestionEnabled: true,
  whatsappAgentEnabled: false,
  officeVirtualEnabled: false,
  hasVoiceAgent: false,
};

describe("buildHelpAssistantSystemPrompt", () => {
  const prompt = buildHelpAssistantSystemPrompt(fullPlan);

  it("contains the exact refusal message", () => {
    expect(prompt).toContain(REFUSAL_MESSAGE);
  });

  it("documents the always-visible Ajustes routes", () => {
    expect(prompt).toContain("/settings?tab=negocio");
    expect(prompt).toContain("/settings?tab=equipo");
    expect(prompt).toContain("/settings?tab=actividad");
  });

  it("documents plan-gated routes when the feature is enabled", () => {
    expect(prompt).toContain("/clientes");
    expect(prompt).toContain("/pipeline");
    expect(prompt).toContain("/settings?tab=integraciones");
    expect(prompt).toContain("Oficina Virtual");
  });

  it("instructs brief, direct, warm answers", () => {
    expect(prompt).toMatch(/breve/i);
    expect(prompt).toMatch(/premium/i);
  });

  it("instructs refusing off-topic and jailbreak attempts", () => {
    expect(prompt).toMatch(/ignores estas instrucciones/);
  });

  it("instructs never revealing the internal agency/superadmin panel", () => {
    expect(prompt).toMatch(/NUNCA menciones ni expliques el panel interno de Onyxlink/);
  });

  it("instructs declining to self-service plan/add-on activation", () => {
    expect(prompt).toMatch(/no es autoservicio/i);
  });

  it("never mentions the superadmin-only Chatbot module", () => {
    expect(prompt).not.toMatch(/chatbot/i);
  });
});

describe("buildHelpAssistantSystemPrompt plan-gating", () => {
  it("omits Clientes/Pipeline/Integraciones knowledge when the client has neither Gestión nor the WhatsApp agent", () => {
    const prompt = buildHelpAssistantSystemPrompt({
      gestionEnabled: false,
      whatsappAgentEnabled: false,
      officeVirtualEnabled: false,
      hasVoiceAgent: false,
    });
    expect(prompt).not.toContain("Nuevo cliente");
    expect(prompt).not.toContain("Nuevo negocio");
    expect(prompt).not.toContain("conectar YCloud");
    expect(prompt).not.toContain("Oficina Virtual: espacio");
  });

  it("lists Gestión-only features as contracted and the rest as not contracted", () => {
    const prompt = buildHelpAssistantSystemPrompt(gestionOnlyPlan);
    expect(prompt).toMatch(/Tiene contratado:.*Onyxlink Gestión/);
    expect(prompt).toMatch(/NO tiene contratado:.*Agente de WhatsApp/);
  });

  it("instructs never explaining in detail a feature the client doesn't have", () => {
    const prompt = buildHelpAssistantSystemPrompt(gestionOnlyPlan);
    expect(prompt).toMatch(/NO expliques el paso a paso/);
  });
});
