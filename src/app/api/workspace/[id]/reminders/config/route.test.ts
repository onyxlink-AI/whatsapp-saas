// RLS/permissions regression: Recordatorios y seguimiento is workspace
// self-service (admin/manager), like agents/prompts/business-info — NOT a
// superadmin-only add-on. GET is member-readable; PATCH requires manager+.

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
    from: (table: string) => {
      if (table === "memberships") return chainable(() => ({ data: membershipData, error: null }));
      throw new Error(`unexpected table: ${table}`);
    },
  })),
}));

const getOrCreateReminderConfig = vi.fn();
const getReminderSteps = vi.fn();
const updateReminderConfig = vi.fn();
const installReminderTemplate = vi.fn();
vi.mock("@/features/reminders/services/reminder-config", () => ({
  getOrCreateReminderConfig,
  getReminderSteps,
  updateReminderConfig,
  installReminderTemplate,
}));

const getReminderReadiness = vi.fn();
vi.mock("@/features/reminders/services/readiness", () => ({ getReminderReadiness }));

const logAudit = vi.fn();
vi.mock("@/features/audit/services/audit-log", () => ({ logAudit }));

const { GET, PATCH } = await import("./route");

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  membershipData = { role: "admin" };
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  getOrCreateReminderConfig.mockResolvedValue({ id: "cfg-1", workspace_id: "empresa-a", enabled: false });
  getReminderSteps.mockResolvedValue([]);
  getReminderReadiness.mockResolvedValue({
    agentConfigured: false,
    openRouterAvailable: false,
    whatsappConnected: false,
    agendaConnected: false,
    ready: false,
  });
});

describe("GET .../reminders/config — any active member can read", () => {
  it("returns config+steps+readiness for a plain agent (not just admin/manager)", async () => {
    membershipData = { role: "agent" };
    const req = new NextRequest("http://localhost/api/workspace/empresa-a/reminders/config");
    const res = await GET(req, params("empresa-a"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.config).toBeTruthy();
    expect(json.readiness).toBeTruthy();
  });

  it("401s an unauthenticated caller", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest("http://localhost/api/workspace/empresa-a/reminders/config");
    const res = await GET(req, params("empresa-a"));
    expect(res.status).toBe(401);
  });

  it("403s a caller with no membership in the workspace", async () => {
    membershipData = null;
    const req = new NextRequest("http://localhost/api/workspace/empresa-b/reminders/config");
    const res = await GET(req, params("empresa-b"));
    expect(res.status).toBe(403);
  });
});

describe("PATCH .../reminders/config — requires manager or admin, never superadmin-gated", () => {
  it("403s a plain agent trying to change the config", async () => {
    membershipData = { role: "agent" };
    const req = new NextRequest("http://localhost/api/workspace/empresa-a/reminders/config", {
      method: "PATCH",
      body: JSON.stringify({ enabled: true }),
    });
    const res = await PATCH(req, params("empresa-a"));
    expect(res.status).toBe(403);
    expect(updateReminderConfig).not.toHaveBeenCalled();
  });

  it("allows a manager to enable the engine", async () => {
    membershipData = { role: "manager" };
    updateReminderConfig.mockResolvedValue({ id: "cfg-1", workspace_id: "empresa-a", enabled: true });
    const req = new NextRequest("http://localhost/api/workspace/empresa-a/reminders/config", {
      method: "PATCH",
      body: JSON.stringify({ enabled: true }),
    });
    const res = await PATCH(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(updateReminderConfig).toHaveBeenCalledWith("empresa-a", { enabled: true });
  });

  it("installing a template logs an audit entry naming the template", async () => {
    membershipData = { role: "admin" };
    installReminderTemplate.mockResolvedValue({
      config: { id: "cfg-1", workspace_id: "empresa-a", template_key: "tattoo_studio" },
      steps: [],
    });
    const req = new NextRequest("http://localhost/api/workspace/empresa-a/reminders/config", {
      method: "PATCH",
      body: JSON.stringify({ install_template_key: "tattoo_studio" }),
    });
    const res = await PATCH(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reminders.install_template" }),
    );
  });
});
