import { describe, it, expect } from "vitest";
import { resolveDashboardCapabilities } from "./capabilities";
import { resolveEntitlements } from "@/features/entitlements/resolve";

const NO_ADDONS = { teamChatEnabled: false, hasVapiAssistant: false };

describe("resolveDashboardCapabilities", () => {
  it("variant 'none' for a workspace with no package, no office/addon widgets", () => {
    const caps = resolveDashboardCapabilities(resolveEntitlements({ product_package: "none" }), NO_ADDONS);
    expect(caps).toEqual({ variant: "none", showOfficeSummary: false, showTeamChatWidget: false, showVapiWidget: false });
  });

  it("variant 'gestion' for Gestión-only (no WhatsApp), never shows office/whatsapp widgets", () => {
    const caps = resolveDashboardCapabilities(resolveEntitlements({ product_package: "gestion" }), NO_ADDONS);
    expect(caps.variant).toBe("gestion");
    expect(caps.showOfficeSummary).toBe(false);
  });

  it("variant 'combined' for whatsapp_gestion, without office summary", () => {
    const caps = resolveDashboardCapabilities(resolveEntitlements({ product_package: "whatsapp_gestion" }), NO_ADDONS);
    expect(caps.variant).toBe("combined");
    expect(caps.showOfficeSummary).toBe(false);
  });

  it("variant 'combined' for suite, WITH office summary", () => {
    const caps = resolveDashboardCapabilities(resolveEntitlements({ product_package: "suite" }), NO_ADDONS);
    expect(caps.variant).toBe("combined");
    expect(caps.showOfficeSummary).toBe(true);
  });

  it("variant 'combined' for whatsapp_oficina (WhatsApp + Oficina, sin Gestión), WITH office summary", () => {
    // Paquete 4: variant sigue siendo 'combined' porque tiene WhatsApp —
    // el consumidor (dashboard/page.tsx) es quien debe omitir el bloque de
    // Gestión cuando hasGestion es false, no la selección de variant.
    const caps = resolveDashboardCapabilities(resolveEntitlements({ product_package: "whatsapp_oficina" }), NO_ADDONS);
    expect(caps.variant).toBe("combined");
    expect(caps.showOfficeSummary).toBe(true);
  });

  it("variant 'combined' for whatsapp (Paquete 5, solo WhatsApp), without office summary", () => {
    const caps = resolveDashboardCapabilities(resolveEntitlements({ product_package: "whatsapp" }), NO_ADDONS);
    expect(caps.variant).toBe("combined");
    expect(caps.showOfficeSummary).toBe(false);
  });

  it("variant 'office' for oficina (Paquete 6, solo Oficina Virtual) — ni 'gestion' ni 'combined' encajan sin WhatsApp ni Gestión", () => {
    const caps = resolveDashboardCapabilities(resolveEntitlements({ product_package: "oficina" }), NO_ADDONS);
    expect(caps.variant).toBe("office");
    expect(caps.showOfficeSummary).toBe(true);
  });

  it("only shows add-on widgets when the add-on is actually configured, regardless of package", () => {
    const caps = resolveDashboardCapabilities(resolveEntitlements({ product_package: "gestion" }), {
      teamChatEnabled: true,
      hasVapiAssistant: true,
    });
    expect(caps.showTeamChatWidget).toBe(true);
    expect(caps.showVapiWidget).toBe(true);
  });

  it("never shows add-on widgets when the workspace has no package at all", () => {
    const caps = resolveDashboardCapabilities(resolveEntitlements({ product_package: "none" }), {
      teamChatEnabled: true,
      hasVapiAssistant: true,
    });
    // El variant "none" no monta ningún bloque — los widgets de add-on solo
    // importan dentro de un bloque que sí se renderiza.
    expect(caps.variant).toBe("none");
  });
});
