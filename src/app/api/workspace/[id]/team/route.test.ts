// Regression tests for the privilege-escalation fix found in the E2E
// production-polish audit: a "manager" could previously invite/promote
// someone (including themselves) to "admin", or deactivate a real admin's
// membership, because neither POST, PATCH nor DELETE ever compared the
// role being assigned/touched against the actor's own rank.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
let actorMembership: { role?: string } | null = { role: "manager" };

function actorChainable(resolve: () => unknown) {
  const obj: Record<string, unknown> = {};
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.maybeSingle = async () => resolve();
  return obj;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => actorChainable(() => ({ data: actorMembership, error: null })),
  })),
}));

// The route's OWN service-role client (`svc()` = @supabase/supabase-js's
// createClient) does a SEPARATE lookup for the TARGET membership's current
// role, plus the actual update/upsert. Build a small flexible chainable that
// resolves differently depending on which verb (select/update/upsert) was
// last called, since the route mixes all three against the same `db`.
let targetMembership: { role?: string } | null = { role: "agent" };
let updateError: { message: string } | null = null;
const updateSpy = vi.fn();

function svcChainable() {
  let lastVerb: "select" | "update" | "upsert" = "select";
  const builder: Record<string, unknown> = {
    select: () => {
      lastVerb = "select";
      return builder;
    },
    update: (...args: unknown[]) => {
      lastVerb = "update";
      updateSpy(...args);
      return builder;
    },
    upsert: (...args: unknown[]) => {
      lastVerb = "upsert";
      updateSpy(...args);
      return builder;
    },
    eq: () => builder,
    maybeSingle: async () => ({ data: targetMembership, error: null }),
    then: (resolve: (v: unknown) => unknown) => {
      if (lastVerb === "update") return resolve({ error: updateError });
      if (lastVerb === "upsert") return resolve({ error: updateError });
      return resolve({ data: targetMembership, error: null });
    },
  };
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => svcChainable(),
  })),
}));

const provisionWorkspaceUser = vi.fn();
vi.mock("@/lib/auth/provision-user", () => ({ provisionWorkspaceUser }));

const { POST, PATCH, DELETE } = await import("./route");

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

const TARGET_USER_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  actorMembership = { role: "manager" };
  targetMembership = { role: "agent" };
  updateError = null;
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  provisionWorkspaceUser.mockResolvedValue({ userId: TARGET_USER_ID, password: "abc12345" });
});

describe("POST .../team — invite", () => {
  it("un manager NO puede invitar a alguien como admin", async () => {
    actorMembership = { role: "manager" };
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ email: "nuevo@empresaa.local", role: "admin" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(403);
    expect(provisionWorkspaceUser).not.toHaveBeenCalled();
  });

  it("un manager SÍ puede invitar a alguien como agent (rol menor al suyo)", async () => {
    actorMembership = { role: "manager" };
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ email: "nuevo@empresaa.local", role: "agent" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(provisionWorkspaceUser).toHaveBeenCalled();
  });

  it("un admin SÍ puede invitar a otro admin", async () => {
    actorMembership = { role: "admin" };
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ email: "nuevo@empresaa.local", role: "admin" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(200);
  });
});

describe("PATCH .../team — cambio de rol / activación", () => {
  it("un manager NO puede auto-promoverse (ni promover a nadie) a admin", async () => {
    actorMembership = { role: "manager" };
    targetMembership = { role: "manager" }; // the actor's own current row
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ userId: TARGET_USER_ID, role: "admin" }),
    });
    const res = await PATCH(req, params("empresa-a"));
    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("un manager NO puede modificar (ni solo pausar) a un admin real", async () => {
    actorMembership = { role: "manager" };
    targetMembership = { role: "admin" };
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ userId: TARGET_USER_ID, is_active: false }),
    });
    const res = await PATCH(req, params("empresa-a"));
    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("un manager SÍ puede modificar a un agent (rol menor)", async () => {
    actorMembership = { role: "manager" };
    targetMembership = { role: "agent" };
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ userId: TARGET_USER_ID, role: "viewer" }),
    });
    const res = await PATCH(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalled();
  });

  it("un admin SÍ puede modificar a otro admin", async () => {
    actorMembership = { role: "admin" };
    targetMembership = { role: "admin" };
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ userId: TARGET_USER_ID, is_active: false }),
    });
    const res = await PATCH(req, params("empresa-a"));
    expect(res.status).toBe(200);
  });
});

describe("DELETE .../team — desactivación", () => {
  it("un manager NO puede desactivar a un admin", async () => {
    actorMembership = { role: "manager" };
    targetMembership = { role: "admin" };
    const req = new NextRequest("http://localhost/x", {
      method: "DELETE",
      body: JSON.stringify({ userId: TARGET_USER_ID }),
    });
    const res = await DELETE(req, params("empresa-a"));
    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("un manager SÍ puede desactivar a un agent", async () => {
    actorMembership = { role: "manager" };
    targetMembership = { role: "agent" };
    const req = new NextRequest("http://localhost/x", {
      method: "DELETE",
      body: JSON.stringify({ userId: TARGET_USER_ID }),
    });
    const res = await DELETE(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalled();
  });
});
