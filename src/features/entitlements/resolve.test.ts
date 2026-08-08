import { describe, it, expect } from "vitest";
import { resolveEntitlements, canUseAssistantActions, lostCapabilities, PACKAGE_MATRIX } from "./resolve";

describe("resolveEntitlements", () => {
  it("none: nothing enabled, lands on /settings", () => {
    const e = resolveEntitlements({ product_package: "none" });
    expect(e).toEqual({
      package: "none",
      hasGestion: false,
      hasWhatsappAgent: false,
      hasOfficeVirtual: false,
      hasWhiteboard: false,
      defaultRoute: "/settings",
    });
  });

  it("gestion: gestión + Board, sin whatsapp/oficina, lands on /dashboard", () => {
    const e = resolveEntitlements({ product_package: "gestion" });
    expect(e).toEqual({
      package: "gestion",
      hasGestion: true,
      hasWhatsappAgent: false,
      hasOfficeVirtual: false,
      hasWhiteboard: true,
      defaultRoute: "/dashboard",
    });
  });

  it("whatsapp_gestion: gestión + whatsapp + Board, sin oficina", () => {
    const e = resolveEntitlements({ product_package: "whatsapp_gestion" });
    expect(e).toEqual({
      package: "whatsapp_gestion",
      hasGestion: true,
      hasWhatsappAgent: true,
      hasOfficeVirtual: false,
      hasWhiteboard: true,
      defaultRoute: "/dashboard",
    });
  });

  it("suite: los 4 activos", () => {
    const e = resolveEntitlements({ product_package: "suite" });
    expect(e).toEqual({
      package: "suite",
      hasGestion: true,
      hasWhatsappAgent: true,
      hasOfficeVirtual: true,
      hasWhiteboard: true,
      defaultRoute: "/dashboard",
    });
  });

  it("falls back to 'none' for null/undefined/unknown values, never throws", () => {
    expect(resolveEntitlements(null).package).toBe("none");
    expect(resolveEntitlements(undefined).package).toBe("none");
    expect(resolveEntitlements({ product_package: null }).package).toBe("none");
    expect(resolveEntitlements({ product_package: "not-a-real-package" }).package).toBe("none");
  });
});

describe("canUseAssistantActions", () => {
  it("false for none/gestion regardless of the kill switch", () => {
    expect(canUseAssistantActions(true, resolveEntitlements({ product_package: "none" }))).toBe(false);
    expect(canUseAssistantActions(true, resolveEntitlements({ product_package: "gestion" }))).toBe(false);
  });

  it("true only for whatsapp_gestion/suite AND the kill switch on", () => {
    expect(canUseAssistantActions(true, resolveEntitlements({ product_package: "whatsapp_gestion" }))).toBe(true);
    expect(canUseAssistantActions(true, resolveEntitlements({ product_package: "suite" }))).toBe(true);
  });

  it("false when the superadmin kill switch is off, even on a commercial-eligible package", () => {
    expect(canUseAssistantActions(false, resolveEntitlements({ product_package: "suite" }))).toBe(false);
  });
});

describe("lostCapabilities", () => {
  it("suite -> gestion loses whatsapp and oficina, keeps gestión/Board", () => {
    expect(lostCapabilities("suite", "gestion")).toEqual(["Agente de WhatsApp y Conversaciones", "Oficina Virtual"]);
  });

  it("suite -> none loses everything", () => {
    expect(lostCapabilities("suite", "none")).toEqual([
      "Clientes, Proyectos, Agenda, Anotaciones y Contenido",
      "Agente de WhatsApp y Conversaciones",
      "Oficina Virtual",
      "Board",
    ]);
  });

  it("gestion -> whatsapp_gestion (upgrade) loses nothing", () => {
    expect(lostCapabilities("gestion", "whatsapp_gestion")).toEqual([]);
  });

  it("same package loses nothing", () => {
    expect(lostCapabilities("suite", "suite")).toEqual([]);
  });
});

describe("PACKAGE_MATRIX", () => {
  it("matches the definitive matrix exactly for all 4 packages", () => {
    expect(PACKAGE_MATRIX).toEqual({
      none: { hasGestion: false, hasWhatsappAgent: false, hasOfficeVirtual: false, hasWhiteboard: false },
      gestion: { hasGestion: true, hasWhatsappAgent: false, hasOfficeVirtual: false, hasWhiteboard: true },
      whatsapp_gestion: { hasGestion: true, hasWhatsappAgent: true, hasOfficeVirtual: false, hasWhiteboard: true },
      suite: { hasGestion: true, hasWhatsappAgent: true, hasOfficeVirtual: true, hasWhiteboard: true },
    });
  });

  it("cada paquete no-'none' concede exactamente gestión+Board, gestión+whatsapp+Board, o los 4 — nunca una combinación intermedia distinta", () => {
    // Enumeración exhaustiva pedida por la revisión correctiva: confirma
    // que no existe ninguna combinación de los 4 flags fuera de estos 4
    // cubos — PACKAGE_MATRIX es literalmente la única fuente, así que esto
    // es una prueba de que la propia matriz sigue siendo exhaustiva y
    // exacta, no una tautología con el objeto de arriba.
    expect(Object.keys(PACKAGE_MATRIX).sort()).toEqual(["gestion", "none", "suite", "whatsapp_gestion"]);
    expect(PACKAGE_MATRIX.none).toEqual({ hasGestion: false, hasWhatsappAgent: false, hasOfficeVirtual: false, hasWhiteboard: false });
    expect(PACKAGE_MATRIX.gestion).toEqual({ hasGestion: true, hasWhatsappAgent: false, hasOfficeVirtual: false, hasWhiteboard: true });
    expect(PACKAGE_MATRIX.whatsapp_gestion).toEqual({ hasGestion: true, hasWhatsappAgent: true, hasOfficeVirtual: false, hasWhiteboard: true });
    expect(PACKAGE_MATRIX.suite).toEqual({ hasGestion: true, hasWhatsappAgent: true, hasOfficeVirtual: true, hasWhiteboard: true });
  });
});
