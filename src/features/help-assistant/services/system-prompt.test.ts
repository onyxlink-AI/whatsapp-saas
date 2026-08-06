import { describe, it, expect } from "vitest";
import { buildHelpAssistantSystemPrompt, REFUSAL_MESSAGE, NO_DELETE_MESSAGE } from "./system-prompt";
import type { HelpAssistantPlanContext } from "../types";

const fullPlan: HelpAssistantPlanContext = {
  gestionEnabled: true,
  whatsappAgentEnabled: true,
  officeVirtualEnabled: true,
  hasVoiceAgent: true,
  whiteboardEnabled: true,
};

const gestionOnlyPlan: HelpAssistantPlanContext = {
  gestionEnabled: true,
  whatsappAgentEnabled: false,
  officeVirtualEnabled: false,
  hasVoiceAgent: false,
  whiteboardEnabled: false,
};

describe("buildHelpAssistantSystemPrompt (actions disabled — the default for every workspace)", () => {
  const prompt = buildHelpAssistantSystemPrompt(fullPlan, false);

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

  it("documents Contenido as a working library, not as under construction", () => {
    expect(prompt).not.toContain("Contenido: en construcción");
    expect(prompt).toContain("Ideas");
    expect(prompt).toContain("Pipeline");
    expect(prompt).toContain("Guiones");
  });

  it("points Oportunidades exclusively to /pipeline, never to the old /proyectos?view=pipeline", () => {
    expect(prompt).toContain("Oportunidades (/pipeline");
    expect(prompt).not.toContain("/proyectos?view=pipeline");
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

  it("says explicitly it has no tools and must never claim to have acted", () => {
    expect(prompt).toMatch(/No tienes ninguna tool/);
    expect(prompt).not.toContain(NO_DELETE_MESSAGE);
  });
});

describe("buildHelpAssistantSystemPrompt (actions enabled — superadmin opted this workspace in)", () => {
  const prompt = buildHelpAssistantSystemPrompt(fullPlan, true);

  it("describes itself as able to create/edit via tools", () => {
    expect(prompt).toMatch(/puedes crear\/editar clientes/);
  });

  it("instructs searching before creating/editing to avoid duplicates or invented ids", () => {
    expect(prompt).toMatch(/Busca primero con la tool search_\*/);
  });

  it("includes the never-delete rule and its exact refusal message", () => {
    expect(prompt).toContain(NO_DELETE_MESSAGE);
    expect(prompt).toMatch(/NUNCA borres nada/);
  });

  it("instructs asking whether a new client is already signed or should go through Pipeline first", () => {
    expect(prompt).toMatch(/ya es cliente firmado, o es un lead nuevo/);
    expect(prompt).toMatch(/NO lo crees en Clientes/);
  });

  it("instructs retaining earlier-turn data and asking for all missing fields at once", () => {
    expect(prompt).toMatch(/NUNCA olvides datos que el usuario ya dio/);
    expect(prompt).toMatch(/pregúntalos TODOS de una sola vez/);
  });

  it("instructs summarizing mixed/ambiguous multi-field messages before calling a tool", () => {
    expect(prompt).toMatch(/resume en una frase lo que entendiste/);
  });

  it('never refuses "crear una empresa/negocio" as off-topic — it means create_deal', () => {
    expect(prompt).toMatch(/SIEMPRE significa crear una Oportunidad/);
  });
});

describe("buildHelpAssistantSystemPrompt plan-gating", () => {
  it("omits Clientes/Pipeline/Integraciones knowledge when the client has neither Gestión nor the WhatsApp agent", () => {
    const prompt = buildHelpAssistantSystemPrompt(
      {
        gestionEnabled: false,
        whatsappAgentEnabled: false,
        officeVirtualEnabled: false,
        hasVoiceAgent: false,
        whiteboardEnabled: false,
      },
      false,
    );
    expect(prompt).not.toContain("Nuevo cliente");
    expect(prompt).not.toContain("Nuevo negocio");
    expect(prompt).not.toContain("conectar YCloud");
    expect(prompt).not.toContain("Oficina Virtual: espacio");
  });

  it("lists Gestión-only features as contracted and the rest as not contracted", () => {
    const prompt = buildHelpAssistantSystemPrompt(gestionOnlyPlan, false);
    expect(prompt).toMatch(/Tiene contratado:.*Onyxlink Gestión/);
    expect(prompt).toMatch(/NO tiene contratado:.*Agente de WhatsApp/);
  });

  it("instructs never explaining in detail a feature the client doesn't have", () => {
    const prompt = buildHelpAssistantSystemPrompt(gestionOnlyPlan, false);
    expect(prompt).toMatch(/NO expliques el paso a paso/);
  });
});

describe("buildHelpAssistantSystemPrompt — Fase 1: informativo (Paquete 1) vs gestión (Paquete 2+)", () => {
  it("Paquete 1 (Gestión sin WhatsApp) stays informational even if superadmin turned actions on — no ACTION_RULES leak into the prompt", () => {
    const prompt = buildHelpAssistantSystemPrompt(gestionOnlyPlan, true);
    expect(prompt).toMatch(/No tienes ninguna tool/);
    expect(prompt).not.toMatch(/puedes crear\/editar clientes/);
    expect(prompt).not.toContain(NO_DELETE_MESSAGE);
  });

  it("Paquete 2 (Gestión + WhatsApp) with actions enabled describes itself as able to act", () => {
    const prompt = buildHelpAssistantSystemPrompt(fullPlan, true);
    expect(prompt).toMatch(/puedes crear\/editar clientes/);
  });

  it("Paquete 2 with actions disabled by superadmin stays informational too", () => {
    const prompt = buildHelpAssistantSystemPrompt(fullPlan, false);
    expect(prompt).toMatch(/No tienes ninguna tool/);
  });
});
