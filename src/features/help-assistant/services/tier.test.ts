import { describe, it, expect } from "vitest";
import { resolveHelpAssistantTier } from "./tier";

// Fase 2: resolveHelpAssistantTier ahora recibe las PackageCapabilities ya
// resueltas por resolveEntitlements() (product_package), no 3 flags sueltos
// con su propia lógica de "por defecto true" — ese idioma ya no existe, el
// paquete siempre resuelve a un valor concreto.
describe("resolveHelpAssistantTier", () => {
  it("returns gestion (30/semana) para el paquete Gestión (sin whatsapp/oficina)", () => {
    const result = resolveHelpAssistantTier({
      hasGestion: true,
      hasWhatsappAgent: false,
      hasOfficeVirtual: false,
      hasWhiteboard: true,
    });
    expect(result).toEqual({ tier: "gestion", label: "Onyxlink Gestión", weeklyLimit: 30 });
  });

  it("returns completo (70/semana) para el paquete WhatsApp + Gestión", () => {
    const result = resolveHelpAssistantTier({
      hasGestion: true,
      hasWhatsappAgent: true,
      hasOfficeVirtual: false,
      hasWhiteboard: true,
    });
    expect(result.tier).toBe("completo");
    expect(result.weeklyLimit).toBe(70);
  });

  it("returns oficina (150/semana) para el paquete Suite", () => {
    const result = resolveHelpAssistantTier({
      hasGestion: true,
      hasWhatsappAgent: true,
      hasOfficeVirtual: true,
      hasWhiteboard: true,
    });
    expect(result).toEqual({
      tier: "oficina",
      label: "Oficina Virtual",
      weeklyLimit: 150,
    });
  });

  it("returns oficina (150/semana) también para whatsapp_oficina (WhatsApp + Oficina, SIN Gestión) — label sin 'Gestión +' porque sería engañoso aquí", () => {
    const result = resolveHelpAssistantTier({
      hasGestion: false,
      hasWhatsappAgent: true,
      hasOfficeVirtual: true,
      hasWhiteboard: true,
    });
    expect(result).toEqual({
      tier: "oficina",
      label: "Oficina Virtual",
      weeklyLimit: 150,
    });
  });

  it("falls back to the gestion tier cuando no hay ningún paquete activo (none)", () => {
    const result = resolveHelpAssistantTier({
      hasGestion: false,
      hasWhatsappAgent: false,
      hasOfficeVirtual: false,
      hasWhiteboard: false,
    });
    expect(result.tier).toBe("gestion");
  });

  it("prioriza oficina sobre las demás capacidades cuando está presente", () => {
    const result = resolveHelpAssistantTier({
      hasGestion: false,
      hasWhatsappAgent: false,
      hasOfficeVirtual: true,
      hasWhiteboard: false,
    });
    expect(result.tier).toBe("oficina");
  });
});
