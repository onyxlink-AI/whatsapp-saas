import { describe, it, expect } from "vitest";
import { resolveHelpAssistantTier } from "./tier";

describe("resolveHelpAssistantTier", () => {
  it("returns gestion (30/semana) when only Gestión is enabled", () => {
    const result = resolveHelpAssistantTier({
      gestion_enabled: true,
      whatsapp_agent_enabled: false,
      office_virtual_enabled: false,
    });
    expect(result).toEqual({ tier: "gestion", label: "Onyxlink Gestión", weeklyLimit: 30 });
  });

  it("returns completo (70/semana) when the WhatsApp agent is enabled, with Gestión", () => {
    const result = resolveHelpAssistantTier({
      gestion_enabled: true,
      whatsapp_agent_enabled: true,
      office_virtual_enabled: false,
    });
    expect(result.tier).toBe("completo");
    expect(result.weeklyLimit).toBe(70);
  });

  it("returns completo for a legacy workspace with the WhatsApp agent but no Gestión", () => {
    const result = resolveHelpAssistantTier({
      gestion_enabled: false,
      whatsapp_agent_enabled: true,
      office_virtual_enabled: false,
    });
    expect(result.tier).toBe("completo");
  });

  it("treats a null whatsapp_agent_enabled as enabled (default-true idiom)", () => {
    const result = resolveHelpAssistantTier({
      gestion_enabled: true,
      whatsapp_agent_enabled: null,
      office_virtual_enabled: false,
    });
    expect(result.tier).toBe("completo");
  });

  it("returns oficina (150/semana) whenever Oficina Virtual is enabled, regardless of the other flags", () => {
    const result = resolveHelpAssistantTier({
      gestion_enabled: true,
      whatsapp_agent_enabled: true,
      office_virtual_enabled: true,
    });
    expect(result).toEqual({
      tier: "oficina",
      label: "Gestión + Oficina Virtual",
      weeklyLimit: 150,
    });
  });

  it("returns oficina even in the edge case where Oficina Virtual is on but Gestión/WhatsApp are off", () => {
    const result = resolveHelpAssistantTier({
      gestion_enabled: false,
      whatsapp_agent_enabled: false,
      office_virtual_enabled: true,
    });
    expect(result.tier).toBe("oficina");
  });

  it("falls back to the gestion tier when nothing is enabled", () => {
    const result = resolveHelpAssistantTier({
      gestion_enabled: false,
      whatsapp_agent_enabled: false,
      office_virtual_enabled: false,
    });
    expect(result.tier).toBe("gestion");
  });
});
