// Cross-tenant IDOR regression: Empresa A's admin must never be able to
// reschedule/cancel an appointment that belongs to Empresa B, even though
// they pass the membership check for their own workspace.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
let membershipData: { role?: string } | null = { role: "admin" };
let appointmentRow: { id: string; workspace_id: string } | null = null;

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
    from: (table: string) => {
      if (table === "memberships") return chainable(() => ({ data: membershipData, error: null }));
      throw new Error(`unexpected table on user-session client: ${table}`);
    },
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "appointments") return chainable(() => ({ data: appointmentRow }));
      throw new Error(`unexpected table on service-role client: ${table}`);
    },
  })),
}));

const rescheduleAppointment = vi.fn();
const cancelAppointment = vi.fn();
const markAppointmentCompleted = vi.fn();
const markAppointmentNoShow = vi.fn();
vi.mock("@/features/reminders/services/appointment-lifecycle", () => ({
  rescheduleAppointment,
  cancelAppointment,
  markAppointmentCompleted,
  markAppointmentNoShow,
}));

const pauseJobsForAppointment = vi.fn();
vi.mock("@/features/reminders/services/job-scheduling", () => ({ pauseJobsForAppointment }));

const logAudit = vi.fn();
vi.mock("@/features/audit/services/audit-log", () => ({ logAudit }));

const { PATCH } = await import("./route");

function params(workspaceId: string, appointmentId: string) {
  return { params: Promise.resolve({ id: workspaceId, appointmentId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  membershipData = { role: "admin" };
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("PATCH .../reminders/appointments/:id — cross-tenant isolation", () => {
  it("404s when the appointment belongs to a different workspace than the URL", async () => {
    appointmentRow = { id: "appt-1", workspace_id: "empresa-a" };
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ action: "cancel" }),
    });
    // Admin of empresa-b tries to cancel an appointment that is really empresa-a's.
    const res = await PATCH(req, params("empresa-b", "appt-1"));
    expect(res.status).toBe(404);
    expect(cancelAppointment).not.toHaveBeenCalled();
  });

  it("404s when the appointment doesn't exist at all", async () => {
    appointmentRow = null;
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, params("empresa-a", "does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("succeeds for the correct workspace and dispatches to the right lifecycle function per action", async () => {
    appointmentRow = { id: "appt-1", workspace_id: "empresa-a" };

    const reschedule = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ action: "reschedule", newScheduledAt: "2026-09-01T10:00:00-06:00" }),
    });
    const res1 = await PATCH(reschedule, params("empresa-a", "appt-1"));
    expect(res1.status).toBe(200);
    expect(rescheduleAppointment).toHaveBeenCalledWith("appt-1", "2026-09-01T10:00:00-06:00");

    const cancel = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ action: "cancel", reason: "cliente lo pidió" }),
    });
    const res2 = await PATCH(cancel, params("empresa-a", "appt-1"));
    expect(res2.status).toBe(200);
    expect(cancelAppointment).toHaveBeenCalledWith("appt-1", "cliente lo pidió");
  });

  it("403s a caller without manager/admin role", async () => {
    membershipData = { role: "agent" };
    appointmentRow = { id: "appt-1", workspace_id: "empresa-a" };
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, params("empresa-a", "appt-1"));
    expect(res.status).toBe(403);
    expect(cancelAppointment).not.toHaveBeenCalled();
  });
});
