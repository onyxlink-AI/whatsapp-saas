// "Botón lógico de emergencia" — requires manager/admin, never a lower role,
// and always logs who did it.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
let membershipData: { role?: string } | null = { role: "admin" };

function chainable(resolve: () => unknown) {
  const obj: Record<string, unknown> = {};
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.maybeSingle = async () => resolve();
  return obj;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => chainable(() => ({ data: membershipData, error: null })),
  })),
}));

const setWorkspacePaused = vi.fn();
vi.mock("@/features/reminders/services/job-scheduling", () => ({ setWorkspacePaused }));

const logAudit = vi.fn();
vi.mock("@/features/audit/services/audit-log", () => ({ logAudit }));

const { POST } = await import("./route");

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  membershipData = { role: "admin" };
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("POST .../reminders/emergency-stop", () => {
  it("403s a plain agent", async () => {
    membershipData = { role: "agent" };
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ action: "stop" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(403);
    expect(setWorkspacePaused).not.toHaveBeenCalled();
  });

  it("stops everything and reports how many jobs were cancelled, with an audit entry", async () => {
    setWorkspacePaused.mockResolvedValue({ cancelledJobs: 7 });
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ action: "stop", reason: "prueba" }),
    });
    const res = await POST(req, params("empresa-a"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.cancelledJobs).toBe(7);
    expect(setWorkspacePaused).toHaveBeenCalledWith("empresa-a", true, "prueba");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reminders.emergency_stop.stop", actorUserId: "user-1" }),
    );
  });

  it("resumes without cancelling anything new", async () => {
    setWorkspacePaused.mockResolvedValue({ cancelledJobs: 0 });
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ action: "resume" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(setWorkspacePaused).toHaveBeenCalledWith("empresa-a", false, undefined);
  });
});
