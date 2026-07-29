// "Pausa por contacto" — requires manager/admin, never a lower role.

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

const pauseContact = vi.fn();
const resumeContact = vi.fn();
vi.mock("@/features/reminders/services/contact-pause", () => ({ pauseContact, resumeContact }));

const logAudit = vi.fn();
vi.mock("@/features/audit/services/audit-log", () => ({ logAudit }));

const { POST } = await import("./route");

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  membershipData = { role: "admin" };
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("POST .../reminders/contact-pause", () => {
  it("403s a plain agent", async () => {
    membershipData = { role: "agent" };
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ contactId: CONTACT_ID, action: "pause" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(403);
    expect(pauseContact).not.toHaveBeenCalled();
  });

  it("pauses a contact and logs an audit entry", async () => {
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ contactId: CONTACT_ID, action: "pause", reason: "cliente lo pidió" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(pauseContact).toHaveBeenCalledWith("empresa-a", CONTACT_ID, "cliente lo pidió");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reminders.contact_pause.pause" }),
    );
  });

  it("resumes a contact", async () => {
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ contactId: CONTACT_ID, action: "resume" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(resumeContact).toHaveBeenCalledWith("empresa-a", CONTACT_ID);
  });
});
