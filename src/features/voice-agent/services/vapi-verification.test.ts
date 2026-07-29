// Regression tests for the honest 4-state Vapi connection status: the
// previous implementation showed "healthy" purely because
// vapi_assistant_id was non-null, with no real check ever performed. These
// tests pin the exact 4 states the E2E closure task requires and confirm
// "verified" can never be reached without a genuine, successful call to
// Vapi's real API gated behind VAPI_API_KEY.

import { afterEach, describe, expect, it, vi } from "vitest";
import { getVapiConnectionStatus } from "./vapi-verification";

const originalApiKey = process.env.VAPI_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) delete process.env.VAPI_API_KEY;
  else process.env.VAPI_API_KEY = originalApiKey;
});

describe("getVapiConnectionStatus", () => {
  it("sin assistantId -> not_configured, sin llamar a fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await getVapiConnectionStatus(null);
    expect(result).toEqual({ status: "not_configured", detail: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("con assistantId pero SIN VAPI_API_KEY -> configured, nunca 'verified' inventado", async () => {
    delete process.env.VAPI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await getVapiConnectionStatus("asst_123");
    expect(result).toEqual({ status: "configured", detail: null });
    // The whole point: no key means no real check is even attempted.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("con VAPI_API_KEY y respuesta 200 real de Vapi -> verified", async () => {
    process.env.VAPI_API_KEY = "sk_test_platform_key";
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await getVapiConnectionStatus("asst_123");
    expect(result).toEqual({ status: "verified", detail: null });
    // The key must be sent as a Bearer token, never as a query param or body field.
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("asst_123");
    expect(init.headers.Authorization).toBe("Bearer sk_test_platform_key");
  });

  it("con VAPI_API_KEY y respuesta de error real de Vapi -> needs_attention, sin filtrar la clave", async () => {
    process.env.VAPI_API_KEY = "sk_test_platform_key";
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await getVapiConnectionStatus("asst_does_not_exist");
    expect(result.status).toBe("needs_attention");
    expect(result.detail).not.toContain("sk_test_platform_key");
  });

  it("con VAPI_API_KEY y fallo de red -> needs_attention, no lanza", async () => {
    process.env.VAPI_API_KEY = "sk_test_platform_key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await getVapiConnectionStatus("asst_123");
    expect(result.status).toBe("needs_attention");
    expect(result.detail).not.toContain("sk_test_platform_key");
  });
});
