// RLS/permissions regression for granular consent: GET is member-readable,
// POST (grant/withdraw) requires manager+ — same tier as the rest of the
// reminders config surface, never inferred, never superadmin-gated.

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

const getConsents = vi.fn();
const grantConsent = vi.fn();
const withdrawConsent = vi.fn();
vi.mock("@/features/reminders/services/consent", () => ({
  getConsents,
  grantConsent,
  withdrawConsent,
  CONSENT_CATEGORIES: ["appointment_reminders", "aftercare_followup", "review_request"],
}));

const logAudit = vi.fn();
vi.mock("@/features/audit/services/audit-log", () => ({ logAudit }));

const { GET, POST } = await import("./route");

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  membershipData = { role: "admin" };
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("GET .../reminders/consent", () => {
  it("any active member can read a contact's consent status", async () => {
    membershipData = { role: "agent" };
    getConsents.mockResolvedValue([{ category: "appointment_reminders", status: "granted" }]);
    const req = new NextRequest("http://localhost/x?contactId=contact-1");
    const res = await GET(req, params("empresa-a"));
    expect(res.status).toBe(200);
  });

  it("403s a caller with no membership", async () => {
    membershipData = null;
    const req = new NextRequest("http://localhost/x?contactId=contact-1");
    const res = await GET(req, params("empresa-a"));
    expect(res.status).toBe(403);
  });
});

describe("POST .../reminders/consent — requires manager or admin", () => {
  it("403s a plain agent trying to grant consent", async () => {
    membershipData = { role: "agent" };
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ contactId: "11111111-1111-4111-8111-111111111111", category: "appointment_reminders", action: "grant" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(403);
    expect(grantConsent).not.toHaveBeenCalled();
  });

  it("allows a manager to grant consent and logs an audit entry without sensitive content", async () => {
    membershipData = { role: "manager" };
    grantConsent.mockResolvedValue({ id: "c1", status: "granted" });
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({
        contactId: "11111111-1111-4111-8111-111111111111",
        category: "appointment_reminders",
        action: "grant",
        method: "whatsapp_reply",
      }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(grantConsent).toHaveBeenCalledWith("empresa-a", "11111111-1111-4111-8111-111111111111", "appointment_reminders", "whatsapp_reply");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reminders.consent.grant" }),
    );
  });

  it("allows withdrawing consent", async () => {
    membershipData = { role: "admin" };
    withdrawConsent.mockResolvedValue({ id: "c1", status: "withdrawn" });
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ contactId: "11111111-1111-4111-8111-111111111111", category: "aftercare_followup", action: "withdraw" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(withdrawConsent).toHaveBeenCalledWith("empresa-a", "11111111-1111-4111-8111-111111111111", "aftercare_followup");
  });

  it("rejects an invalid category", async () => {
    membershipData = { role: "admin" };
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ contactId: "11111111-1111-4111-8111-111111111111", category: "not_a_real_category", action: "grant" }),
    });
    const res = await POST(req, params("empresa-a"));
    expect(res.status).toBe(400);
    expect(grantConsent).not.toHaveBeenCalled();
  });
});
