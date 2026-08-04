import { describe, it, expect, vi, beforeEach } from "vitest";

const createClientRecord = vi.fn();
const updateClientRecord = vi.fn();
const listClients = vi.fn();
vi.mock("@/features/clients/services/client-actions", () => ({
  createClientRecord: (...args: unknown[]) => createClientRecord(...args),
  updateClientRecord: (...args: unknown[]) => updateClientRecord(...args),
  listClients: (...args: unknown[]) => listClients(...args),
}));

const createDeal = vi.fn();
const updateDeal = vi.fn();
const getDealsForBoard = vi.fn();
vi.mock("@/features/pipeline/services/deal-actions", () => ({
  createDeal: (...args: unknown[]) => createDeal(...args),
  updateDeal: (...args: unknown[]) => updateDeal(...args),
  getDealsForBoard: (...args: unknown[]) => getDealsForBoard(...args),
}));

const createProject = vi.fn();
const updateProject = vi.fn();
const getProjectsForBoard = vi.fn();
vi.mock("@/features/projects/services/project-actions", () => ({
  createProject: (...args: unknown[]) => createProject(...args),
  updateProject: (...args: unknown[]) => updateProject(...args),
  getProjectsForBoard: (...args: unknown[]) => getProjectsForBoard(...args),
}));

const createTask = vi.fn();
const updateTask = vi.fn();
const listTasks = vi.fn();
vi.mock("@/features/projects/services/task-actions", () => ({
  createTask: (...args: unknown[]) => createTask(...args),
  updateTask: (...args: unknown[]) => updateTask(...args),
  listTasks: (...args: unknown[]) => listTasks(...args),
}));

const createWhiteboard = vi.fn();
const renameWhiteboard = vi.fn();
const listWhiteboards = vi.fn();
vi.mock("@/features/whiteboard/services/whiteboard-actions", () => ({
  createWhiteboard: (...args: unknown[]) => createWhiteboard(...args),
  renameWhiteboard: (...args: unknown[]) => renameWhiteboard(...args),
  listWhiteboards: (...args: unknown[]) => listWhiteboards(...args),
}));

const logAudit = vi.fn();
vi.mock("@/features/audit/services/audit-log", () => ({
  logAudit: (...args: unknown[]) => logAudit(...args),
}));

const { buildClientTools } = await import("./client-tools");
const { buildPipelineTools, CreateDealSchema } = await import("./pipeline-tools");
const { buildProjectTools } = await import("./project-tools");
const { buildWhiteboardTools } = await import("./whiteboard-tools");
const { buildActionTools } = await import("./index");

const ctx = { workspaceId: "ws1", actorUserId: "user1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildActionTools plan gating", () => {
  it("returns no tools when the workspace has neither Gestión nor the WhatsApp agent", () => {
    const tools = buildActionTools(ctx, {
      gestionEnabled: false,
      whatsappAgentEnabled: false,
      officeVirtualEnabled: false,
      hasVoiceAgent: false,
      whiteboardEnabled: false,
    });
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it("includes client/project/pipeline tools when Gestión is enabled", () => {
    const tools = buildActionTools(ctx, {
      gestionEnabled: true,
      whatsappAgentEnabled: false,
      officeVirtualEnabled: false,
      hasVoiceAgent: false,
      whiteboardEnabled: false,
    });
    expect(tools).toHaveProperty("create_client");
    expect(tools).toHaveProperty("create_project");
    expect(tools).toHaveProperty("create_deal");
  });

  it("includes only pipeline tools when only the WhatsApp agent is enabled (no Gestión)", () => {
    const tools = buildActionTools(ctx, {
      gestionEnabled: false,
      whatsappAgentEnabled: true,
      officeVirtualEnabled: false,
      hasVoiceAgent: false,
      whiteboardEnabled: false,
    });
    expect(tools).not.toHaveProperty("create_client");
    expect(tools).not.toHaveProperty("create_project");
    expect(tools).not.toHaveProperty("create_whiteboard");
    expect(tools).toHaveProperty("create_deal");
  });

  it("includes whiteboard tools only when Gestión AND Pizarra are both enabled", () => {
    const withoutWhiteboard = buildActionTools(ctx, {
      gestionEnabled: true,
      whatsappAgentEnabled: false,
      officeVirtualEnabled: false,
      hasVoiceAgent: false,
      whiteboardEnabled: false,
    });
    expect(withoutWhiteboard).not.toHaveProperty("create_whiteboard");

    const withWhiteboard = buildActionTools(ctx, {
      gestionEnabled: true,
      whatsappAgentEnabled: false,
      officeVirtualEnabled: false,
      hasVoiceAgent: false,
      whiteboardEnabled: true,
    });
    expect(withWhiteboard).toHaveProperty("create_whiteboard");
    expect(withWhiteboard).toHaveProperty("rename_whiteboard");
    expect(withWhiteboard).toHaveProperty("search_whiteboards");
  });
});

describe("whiteboard-tools", () => {
  it("create_whiteboard succeeds and logs an audit entry", async () => {
    createWhiteboard.mockResolvedValue({ ok: true, data: { id: "wb1" } });
    const tools = buildWhiteboardTools(ctx);

    const result = await tools.create_whiteboard.execute!(
      { name: "Lluvia de ideas" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, whiteboard_id: "wb1" });
    expect(createWhiteboard).toHaveBeenCalledWith("ws1", "Lluvia de ideas");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "help_assistant.create_whiteboard", targetId: "wb1" }),
    );
  });

  it("rename_whiteboard succeeds and logs an audit entry", async () => {
    renameWhiteboard.mockResolvedValue({ ok: true, data: null });
    const tools = buildWhiteboardTools(ctx);

    const result = await tools.rename_whiteboard.execute!(
      { whiteboard_id: "11111111-1111-4111-8111-111111111111", name: "Roadmap Q1" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, whiteboard_id: "11111111-1111-4111-8111-111111111111" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "help_assistant.rename_whiteboard" }),
    );
  });

  it("search_whiteboards filters by name", async () => {
    listWhiteboards.mockResolvedValue([
      { id: "wb1", name: "Roadmap Q1", updated_at: "2026-08-01" },
      { id: "wb2", name: "Notas reunión", updated_at: "2026-08-02" },
    ]);
    const tools = buildWhiteboardTools(ctx);

    const result = await tools.search_whiteboards.execute!(
      { query: "roadmap" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual([{ whiteboard_id: "wb1", name: "Roadmap Q1", updated_at: "2026-08-01" }]);
  });
});

describe("client-tools", () => {
  it("create_client succeeds and logs an audit entry", async () => {
    createClientRecord.mockResolvedValue({ ok: true, data: { id: "c1" } });
    const tools = buildClientTools(ctx);

    const result = await tools.create_client.execute!(
      { name: "Ana López", phone: "+34600000111" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, client_id: "c1" });
    expect(createClientRecord).toHaveBeenCalledWith("ws1", expect.objectContaining({ name: "Ana López", phone: "+34600000111" }));
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "help_assistant.create_client", targetId: "c1", actorUserId: "user1" }),
    );
  });

  it("create_client surfaces the duplicate-phone error and does NOT log an audit entry", async () => {
    createClientRecord.mockResolvedValue({ ok: false, error: "Ya existe un cliente con ese teléfono" });
    const tools = buildClientTools(ctx);

    const result = await tools.create_client.execute!(
      { name: "Ana López", phone: "+34600000111" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: false, error: "Ya existe un cliente con ese teléfono" });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("create_client succeeds with only a name — phone is no longer required", async () => {
    createClientRecord.mockResolvedValue({ ok: true, data: { id: "c2" } });
    const tools = buildClientTools(ctx);

    const result = await tools.create_client.execute!(
      { name: "Cliente sin teléfono" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, client_id: "c2" });
    expect(createClientRecord).toHaveBeenCalledWith(
      "ws1",
      expect.objectContaining({ name: "Cliente sin teléfono", phone: "" }),
    );
  });

  it("search_clients maps results to a minimal shape", async () => {
    listClients.mockResolvedValue([
      { id: "c1", name: "Ana", phone: "+34600000111", email: null, client_status: "potencial" },
    ]);
    const tools = buildClientTools(ctx);

    const result = await tools.search_clients.execute!({ query: "Ana" }, { toolCallId: "t1", messages: [] } as never);

    expect(listClients).toHaveBeenCalledWith("ws1", { search: "Ana" });
    expect(result).toEqual([{ client_id: "c1", name: "Ana", phone: "+34600000111", email: null, status: "potencial" }]);
  });
});

describe("pipeline-tools", () => {
  it("CreateDealSchema rejects a deal with only a phone and no name/contact_id, with a clear message", () => {
    const result = CreateDealSchema.safeParse({ title: "Panel completo", lead_phone: "+34600000111" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/Falta el nombre/);
    }
  });

  it("CreateDealSchema accepts a deal with lead_name + lead_phone and no contact_id", () => {
    const result = CreateDealSchema.safeParse({
      title: "Panel completo",
      lead_name: "Scape Room Sevilla",
      lead_phone: "+34600000111",
    });
    expect(result.success).toBe(true);
  });

  it("CreateDealSchema accepts a deal with only lead_name — phone is no longer required", () => {
    const result = CreateDealSchema.safeParse({
      title: "Panel completo",
      lead_name: "Scape Room Sevilla",
    });
    expect(result.success).toBe(true);
  });

  it("create_deal succeeds and logs an audit entry", async () => {
    createDeal.mockResolvedValue({ ok: true, data: { id: "d1" } });
    const tools = buildPipelineTools(ctx);

    const result = await tools.create_deal.execute!(
      { title: "Panel completo", lead_name: "Ana", lead_phone: "+34600000111" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, deal_id: "d1" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.create_deal" }));
  });
});

describe("project-tools", () => {
  it("create_project succeeds and logs an audit entry", async () => {
    createProject.mockResolvedValue({ ok: true, data: { id: "p1" } });
    const tools = buildProjectTools(ctx);

    const result = await tools.create_project.execute!(
      { name: "Reforma web" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, project_id: "p1" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.create_project" }));
  });

  it("create_task requires a project_id and logs an audit entry on success", async () => {
    createTask.mockResolvedValue({ ok: true, data: { id: "task1" } });
    const tools = buildProjectTools(ctx);

    const result = await tools.create_task.execute!(
      { project_id: "p1", title: "Enviar propuesta" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, task_id: "task1" });
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ project_id: "p1", title: "Enviar propuesta" }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.create_task" }));
  });
});
