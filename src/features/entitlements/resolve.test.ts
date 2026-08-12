import { describe, it, expect } from "vitest";
import { resolveEntitlements, canUseAssistantActions, lostCapabilities, PACKAGE_MATRIX, type ProductPackage } from "./resolve";

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

  it("whatsapp_oficina: whatsapp + oficina, SIN gestión NI Board (Paquete 4) — Board vive dentro de Gestión", () => {
    const e = resolveEntitlements({ product_package: "whatsapp_oficina" });
    expect(e).toEqual({
      package: "whatsapp_oficina",
      hasGestion: false,
      hasWhatsappAgent: true,
      hasOfficeVirtual: true,
      hasWhiteboard: false,
      defaultRoute: "/dashboard",
    });
  });

  it("whatsapp: solo whatsapp, SIN gestión, oficina NI Board (Paquete 5)", () => {
    const e = resolveEntitlements({ product_package: "whatsapp" });
    expect(e).toEqual({
      package: "whatsapp",
      hasGestion: false,
      hasWhatsappAgent: true,
      hasOfficeVirtual: false,
      hasWhiteboard: false,
      defaultRoute: "/dashboard",
    });
  });

  it("oficina: solo oficina, SIN gestión, whatsapp NI Board (Paquete 6)", () => {
    const e = resolveEntitlements({ product_package: "oficina" });
    expect(e).toEqual({
      package: "oficina",
      hasGestion: false,
      hasWhatsappAgent: false,
      hasOfficeVirtual: true,
      hasWhiteboard: false,
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

  it("false for whatsapp_oficina — has WhatsApp but not Gestión, so no write tools even with the kill switch on", () => {
    // Regression: la versión anterior comprobaba `package !== 'none' &&
    // package !== 'gestion'` (lista negra de nombres), que daría `true`
    // aquí por error — capacidad, no nombre.
    expect(canUseAssistantActions(true, resolveEntitlements({ product_package: "whatsapp_oficina" }))).toBe(false);
  });

  it("false for whatsapp/oficina (Paquetes 5 y 6) — ninguno tiene Gestión", () => {
    expect(canUseAssistantActions(true, resolveEntitlements({ product_package: "whatsapp" }))).toBe(false);
    expect(canUseAssistantActions(true, resolveEntitlements({ product_package: "oficina" }))).toBe(false);
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

  it("suite -> none loses everything, incluido Board (va junto con Gestión)", () => {
    expect(lostCapabilities("suite", "none")).toEqual([
      "Clientes, Proyectos, Agenda, Anotaciones, Contenido y Board",
      "Agente de WhatsApp y Conversaciones",
      "Oficina Virtual",
    ]);
  });

  it("gestion -> whatsapp_gestion (upgrade) loses nothing", () => {
    expect(lostCapabilities("gestion", "whatsapp_gestion")).toEqual([]);
  });

  it("gestion -> whatsapp_oficina loses gestión (y Board con ella) aunque gane whatsapp+oficina (cambio lateral, no un upgrade limpio)", () => {
    expect(lostCapabilities("gestion", "whatsapp_oficina")).toEqual([
      "Clientes, Proyectos, Agenda, Anotaciones, Contenido y Board",
    ]);
  });

  it("whatsapp_gestion -> whatsapp_oficina loses gestión Y Board (Board ya no es independiente), conserva whatsapp y gana oficina", () => {
    expect(lostCapabilities("whatsapp_gestion", "whatsapp_oficina")).toEqual([
      "Clientes, Proyectos, Agenda, Anotaciones, Contenido y Board",
    ]);
  });

  it("suite -> whatsapp_oficina loses gestión y Board juntos", () => {
    expect(lostCapabilities("suite", "whatsapp_oficina")).toEqual([
      "Clientes, Proyectos, Agenda, Anotaciones, Contenido y Board",
    ]);
  });

  it("whatsapp_oficina -> whatsapp loses solo oficina (ninguno de los dos tenía Board)", () => {
    expect(lostCapabilities("whatsapp_oficina", "whatsapp")).toEqual(["Oficina Virtual"]);
  });

  it("whatsapp_oficina -> oficina loses solo whatsapp (ninguno de los dos tenía Board)", () => {
    expect(lostCapabilities("whatsapp_oficina", "oficina")).toEqual(["Agente de WhatsApp y Conversaciones"]);
  });

  it("suite -> whatsapp (Paquete 5) loses gestión+Board y oficina", () => {
    expect(lostCapabilities("suite", "whatsapp")).toEqual([
      "Clientes, Proyectos, Agenda, Anotaciones, Contenido y Board",
      "Oficina Virtual",
    ]);
  });

  it("suite -> oficina (Paquete 6) loses gestión+Board y whatsapp", () => {
    expect(lostCapabilities("suite", "oficina")).toEqual([
      "Clientes, Proyectos, Agenda, Anotaciones, Contenido y Board",
      "Agente de WhatsApp y Conversaciones",
    ]);
  });

  it("same package loses nothing", () => {
    expect(lostCapabilities("suite", "suite")).toEqual([]);
    expect(lostCapabilities("whatsapp_oficina", "whatsapp_oficina")).toEqual([]);
    expect(lostCapabilities("whatsapp", "whatsapp")).toEqual([]);
    expect(lostCapabilities("oficina", "oficina")).toEqual([]);
  });
});

describe("PACKAGE_MATRIX", () => {
  it("matches the definitive matrix exactly for all 7 packages", () => {
    expect(PACKAGE_MATRIX).toEqual({
      none: { hasGestion: false, hasWhatsappAgent: false, hasOfficeVirtual: false, hasWhiteboard: false },
      gestion: { hasGestion: true, hasWhatsappAgent: false, hasOfficeVirtual: false, hasWhiteboard: true },
      whatsapp_gestion: { hasGestion: true, hasWhatsappAgent: true, hasOfficeVirtual: false, hasWhiteboard: true },
      whatsapp: { hasGestion: false, hasWhatsappAgent: true, hasOfficeVirtual: false, hasWhiteboard: false },
      oficina: { hasGestion: false, hasWhatsappAgent: false, hasOfficeVirtual: true, hasWhiteboard: false },
      whatsapp_oficina: { hasGestion: false, hasWhatsappAgent: true, hasOfficeVirtual: true, hasWhiteboard: false },
      suite: { hasGestion: true, hasWhatsappAgent: true, hasOfficeVirtual: true, hasWhiteboard: true },
    });
  });

  it("hasWhiteboard es siempre idéntico a hasGestion en los 7 paquetes — Board vive dentro de Gestión, nunca independiente", () => {
    for (const pkg of Object.keys(PACKAGE_MATRIX) as ProductPackage[]) {
      expect(PACKAGE_MATRIX[pkg].hasWhiteboard).toBe(PACKAGE_MATRIX[pkg].hasGestion);
    }
  });

  it("cada paquete no-'none' concede exactamente uno de los 7 cubos conocidos — nunca una combinación intermedia distinta", () => {
    // Enumeración exhaustiva pedida por la revisión correctiva: confirma
    // que no existe ninguna combinación de los 4 flags fuera de estos 7
    // cubos — PACKAGE_MATRIX es literalmente la única fuente, así que esto
    // es una prueba de que la propia matriz sigue siendo exhaustiva y
    // exacta, no una tautología con el objeto de arriba.
    expect(Object.keys(PACKAGE_MATRIX).sort()).toEqual([
      "gestion",
      "none",
      "oficina",
      "suite",
      "whatsapp",
      "whatsapp_gestion",
      "whatsapp_oficina",
    ]);
    expect(PACKAGE_MATRIX.none).toEqual({ hasGestion: false, hasWhatsappAgent: false, hasOfficeVirtual: false, hasWhiteboard: false });
    expect(PACKAGE_MATRIX.gestion).toEqual({ hasGestion: true, hasWhatsappAgent: false, hasOfficeVirtual: false, hasWhiteboard: true });
    expect(PACKAGE_MATRIX.whatsapp_gestion).toEqual({ hasGestion: true, hasWhatsappAgent: true, hasOfficeVirtual: false, hasWhiteboard: true });
    expect(PACKAGE_MATRIX.whatsapp).toEqual({ hasGestion: false, hasWhatsappAgent: true, hasOfficeVirtual: false, hasWhiteboard: false });
    expect(PACKAGE_MATRIX.oficina).toEqual({ hasGestion: false, hasWhatsappAgent: false, hasOfficeVirtual: true, hasWhiteboard: false });
    expect(PACKAGE_MATRIX.whatsapp_oficina).toEqual({ hasGestion: false, hasWhatsappAgent: true, hasOfficeVirtual: true, hasWhiteboard: false });
    expect(PACKAGE_MATRIX.suite).toEqual({ hasGestion: true, hasWhatsappAgent: true, hasOfficeVirtual: true, hasWhiteboard: true });
  });
});
