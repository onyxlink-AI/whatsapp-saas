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
const reassignTask = vi.fn();
vi.mock("@/features/projects/services/task-actions", () => ({
  createTask: (...args: unknown[]) => createTask(...args),
  updateTask: (...args: unknown[]) => updateTask(...args),
  listTasks: (...args: unknown[]) => listTasks(...args),
  reassignTask: (...args: unknown[]) => reassignTask(...args),
}));

const createSubtask = vi.fn();
const updateSubtask = vi.fn();
const toggleSubtask = vi.fn();
const listSubtasks = vi.fn();
vi.mock("@/features/projects/services/subtask-actions", () => ({
  createSubtask: (...args: unknown[]) => createSubtask(...args),
  updateSubtask: (...args: unknown[]) => updateSubtask(...args),
  toggleSubtask: (...args: unknown[]) => toggleSubtask(...args),
  listSubtasks: (...args: unknown[]) => listSubtasks(...args),
}));

const createWhiteboard = vi.fn();
const renameWhiteboard = vi.fn();
const listWhiteboards = vi.fn();
vi.mock("@/features/whiteboard/services/whiteboard-actions", () => ({
  createWhiteboard: (...args: unknown[]) => createWhiteboard(...args),
  renameWhiteboard: (...args: unknown[]) => renameWhiteboard(...args),
  listWhiteboards: (...args: unknown[]) => listWhiteboards(...args),
}));

const searchAgendaTasks = vi.fn();
const createAgendaTask = vi.fn();
const updateAgendaTask = vi.fn();
const toggleAgendaTaskDone = vi.fn();
const getAgendaTaskById = vi.fn();
const restoreAgendaTask = vi.fn();
vi.mock("@/features/projects/services/agenda-actions", () => ({
  searchAgendaTasks: (...args: unknown[]) => searchAgendaTasks(...args),
  createAgendaTask: (...args: unknown[]) => createAgendaTask(...args),
  updateAgendaTask: (...args: unknown[]) => updateAgendaTask(...args),
  toggleAgendaTaskDone: (...args: unknown[]) => toggleAgendaTaskDone(...args),
  getAgendaTaskById: (...args: unknown[]) => getAgendaTaskById(...args),
  restoreAgendaTask: (...args: unknown[]) => restoreAgendaTask(...args),
}));

// prepareConfirmableAction se mockea; createPendingConfirmationSlot/tipos se
// mantienen reales (vía importOriginal) — es lógica pura ({remaining:1,
// prepared:null}), probarla contra un doble no aportaría nada.
const prepareConfirmableAction = vi.fn();
vi.mock("../pending-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../pending-actions")>();
  return {
    ...actual,
    prepareConfirmableAction: (...args: unknown[]) => prepareConfirmableAction(...args),
  };
});

const searchNotes = vi.fn();
const createNote = vi.fn();
const updateNote = vi.fn();
const setNoteArchived = vi.fn();
vi.mock("@/features/notes/services/note-actions", () => ({
  searchNotes: (...args: unknown[]) => searchNotes(...args),
  createNote: (...args: unknown[]) => createNote(...args),
  updateNote: (...args: unknown[]) => updateNote(...args),
  setNoteArchived: (...args: unknown[]) => setNoteArchived(...args),
}));

const searchContentItems = vi.fn();
const getContentItem = vi.fn();
const createContentItem = vi.fn();
const updateContentItem = vi.fn();
const updateContentItemFieldsCas = vi.fn();
const moveContentStatus = vi.fn();
vi.mock("@/features/content/services/content-actions", () => ({
  searchContentItems: (...args: unknown[]) => searchContentItems(...args),
  getContentItem: (...args: unknown[]) => getContentItem(...args),
  createContentItem: (...args: unknown[]) => createContentItem(...args),
  updateContentItem: (...args: unknown[]) => updateContentItem(...args),
  updateContentItemFieldsCas: (...args: unknown[]) => updateContentItemFieldsCas(...args),
  moveContentStatus: (...args: unknown[]) => moveContentStatus(...args),
}));

const generateContentScript = vi.fn();
vi.mock("@/features/content/services/content-script-ai", () => ({
  generateContentScript: (...args: unknown[]) => generateContentScript(...args),
}));

const logAudit = vi.fn();
vi.mock("@/features/audit/services/audit-log", () => ({
  logAudit: (...args: unknown[]) => logAudit(...args),
}));

// Fase 4A: cada tool ahora llama a assertHelpActionAccess() antes de hacer
// nada. Se mockea "concedido" por defecto para que estas pruebas sigan
// probando la lógica propia de cada tool — la puerta de acceso en sí se
// prueba a fondo en assistant-access.test.ts.
const assertHelpActionAccess = vi.fn();
vi.mock("../assistant-access", () => ({
  assertHelpActionAccess: (...args: unknown[]) => assertHelpActionAccess(...args),
  assistantAccessErrorMessage: (reason: string) => `denied:${reason}`,
}));

const { buildClientTools } = await import("./client-tools");
const { buildPipelineTools, CreateDealSchema } = await import("./pipeline-tools");
const { buildProjectTools } = await import("./project-tools");
const { buildWhiteboardTools } = await import("./whiteboard-tools");
const { buildAgendaTools } = await import("./agenda-tools");
const { buildNoteTools } = await import("./note-tools");
const { buildContentTools } = await import("./content-tools");
const { buildActionTools } = await import("./index");
const { createPendingConfirmationSlot } = await import("../pending-actions");

const ctx = { workspaceId: "ws1", actorUserId: "user1" };

beforeEach(() => {
  vi.clearAllMocks();
  assertHelpActionAccess.mockResolvedValue({ ok: true, role: "admin" });
});

describe("buildActionTools plan gating", () => {
  it("returns no tools when the workspace has neither Gestión nor the WhatsApp agent", () => {
    const { tools } = buildActionTools(
      ctx,
      { package: "none", gestionEnabled: false, whatsappAgentEnabled: false, officeVirtualEnabled: false, hasVoiceAgent: false, whiteboardEnabled: false },
      true,
    );
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it("Paquete 1 (Gestión sin WhatsApp) is the informational assistant — no write tools at all", () => {
    const { tools } = buildActionTools(
      ctx,
      { package: "gestion", gestionEnabled: true, whatsappAgentEnabled: false, officeVirtualEnabled: false, hasVoiceAgent: false, whiteboardEnabled: true },
      true,
    );
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it("whatsapp (Paquete 5, solo WhatsApp) is the informational assistant too — no write tools despite WhatsApp+kill switch on", () => {
    const { tools } = buildActionTools(
      ctx,
      { package: "whatsapp", gestionEnabled: false, whatsappAgentEnabled: true, officeVirtualEnabled: false, hasVoiceAgent: false, whiteboardEnabled: true },
      true,
    );
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it("oficina (Paquete 6, solo Oficina Virtual) is the informational assistant too — no write tools despite Oficina+kill switch on", () => {
    const { tools } = buildActionTools(
      ctx,
      { package: "oficina", gestionEnabled: false, whatsappAgentEnabled: false, officeVirtualEnabled: true, hasVoiceAgent: false, whiteboardEnabled: true },
      true,
    );
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it("whatsapp_oficina (Paquete 4: WhatsApp + Oficina Virtual, SIN Gestión) is the informational assistant too — no write tools despite WhatsApp+Oficina+kill switch all on", () => {
    // Regression del fix de canUseAssistantActions() (capacidad, no lista
    // negra de nombres): antes de ese fix, este contexto habría devuelto
    // las mismas tools que whatsapp_gestion por error, dando escrituras de
    // Clientes/Pipeline/Proyectos a un workspace sin Gestión contratada.
    const { tools } = buildActionTools(
      ctx,
      { package: "whatsapp_oficina", gestionEnabled: false, whatsappAgentEnabled: true, officeVirtualEnabled: true, hasVoiceAgent: false, whiteboardEnabled: true },
      true,
    );
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it("kill switch off (actionsEnabled=false) means no write tools even on Suite", () => {
    const { tools } = buildActionTools(
      ctx,
      { package: "suite", gestionEnabled: true, whatsappAgentEnabled: true, officeVirtualEnabled: true, hasVoiceAgent: false, whiteboardEnabled: true },
      false,
    );
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it("Paquete 2 (whatsapp_gestion) is the management assistant — full write tools across every 4A domain, plus 4B's cancel/restore agenda", () => {
    const { tools } = buildActionTools(
      ctx,
      { package: "whatsapp_gestion", gestionEnabled: true, whatsappAgentEnabled: true, officeVirtualEnabled: false, hasVoiceAgent: false, whiteboardEnabled: true },
      true,
    );
    expect(tools).toHaveProperty("create_client");
    expect(tools).toHaveProperty("create_project");
    expect(tools).toHaveProperty("create_deal");
    expect(tools).toHaveProperty("create_agenda_item");
    expect(tools).toHaveProperty("search_agenda_items");
    expect(tools).toHaveProperty("update_agenda_item");
    expect(tools).toHaveProperty("complete_agenda_item");
    expect(tools).toHaveProperty("cancel_agenda_item");
    expect(tools).toHaveProperty("restore_agenda_item");
    expect(tools).toHaveProperty("create_note");
    expect(tools).toHaveProperty("search_notes");
    expect(tools).toHaveProperty("update_note");
    expect(tools).toHaveProperty("archive_note");
    expect(tools).toHaveProperty("search_content");
    expect(tools).toHaveProperty("create_content_idea");
    expect(tools).toHaveProperty("update_content_general");
    expect(tools).toHaveProperty("update_content_script");
    expect(tools).toHaveProperty("move_content_status");
    expect(tools).toHaveProperty("update_content_metrics");
    expect(tools).toHaveProperty("generate_content_script");
    expect(tools).toHaveProperty("assign_task");
    expect(tools).toHaveProperty("create_subtask");
    expect(tools).toHaveProperty("update_subtask");
    expect(tools).toHaveProperty("complete_subtask");
    expect(tools).toHaveProperty("search_subtasks");
  });

  it("suite: Gestión + Oficina (context) — mismas tools de escritura que whatsapp_gestion, Board incluido automáticamente", () => {
    const { tools } = buildActionTools(
      ctx,
      { package: "suite", gestionEnabled: true, whatsappAgentEnabled: true, officeVirtualEnabled: true, hasVoiceAgent: false, whiteboardEnabled: true },
      true,
    );
    expect(tools).toHaveProperty("create_client");
    expect(tools).toHaveProperty("create_agenda_item");
    expect(tools).toHaveProperty("create_whiteboard");
    expect(tools).toHaveProperty("rename_whiteboard");
  });

  it("includes whiteboard tools only when Gestión, WhatsApp AND Board are all enabled — board itself stays search/create/rename only", () => {
    const { tools: withoutWhiteboard } = buildActionTools(
      ctx,
      { package: "whatsapp_gestion", gestionEnabled: true, whatsappAgentEnabled: true, officeVirtualEnabled: false, hasVoiceAgent: false, whiteboardEnabled: false },
      true,
    );
    expect(withoutWhiteboard).not.toHaveProperty("create_whiteboard");

    const { tools: withWhiteboard } = buildActionTools(
      ctx,
      { package: "whatsapp_gestion", gestionEnabled: true, whatsappAgentEnabled: true, officeVirtualEnabled: false, hasVoiceAgent: false, whiteboardEnabled: true },
      true,
    );
    expect(withWhiteboard).toHaveProperty("create_whiteboard");
    expect(withWhiteboard).toHaveProperty("rename_whiteboard");
    expect(withWhiteboard).toHaveProperty("search_whiteboards");
    // Fase 4C todavía no ha empezado — nunca una tool de scene_data.
    expect(Object.keys(withWhiteboard).some((k) => k.includes("scene"))).toBe(false);
  });

  it("returns a fresh confirmationSlot per call, starting with remaining=1 and prepared=null", () => {
    const { confirmationSlot } = buildActionTools(
      ctx,
      { package: "whatsapp_gestion", gestionEnabled: true, whatsappAgentEnabled: true, officeVirtualEnabled: false, hasVoiceAgent: false, whiteboardEnabled: true },
      true,
    );
    expect(confirmationSlot).toEqual({ remaining: 1, prepared: null });
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
    expect(renameWhiteboard).toHaveBeenCalledWith("ws1", "11111111-1111-4111-8111-111111111111", "Roadmap Q1");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "help_assistant.rename_whiteboard" }),
    );
  });

  it("rename_whiteboard translates not_found_or_forbidden into a clear message", async () => {
    renameWhiteboard.mockResolvedValue({ ok: false, error: "not_found_or_forbidden" });
    const tools = buildWhiteboardTools(ctx);

    const result = await tools.rename_whiteboard.execute!(
      { whiteboard_id: "11111111-1111-4111-8111-111111111111", name: "X" },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toEqual({ ok: false, error: "No encontré ese tablero en esta empresa" });
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

  it("denies access when assertHelpActionAccess rejects, without calling the underlying service", async () => {
    assertHelpActionAccess.mockResolvedValue({ ok: false, reason: "role_not_allowed" });
    const tools = buildWhiteboardTools(ctx);

    const result = await tools.create_whiteboard.execute!({ name: "X" }, { toolCallId: "t1", messages: [] } as never);
    expect(result).toEqual({ ok: false, error: "denied:role_not_allowed" });
    expect(createWhiteboard).not.toHaveBeenCalled();
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
    expect(createTask).toHaveBeenCalledWith("ws1", expect.objectContaining({ project_id: "p1", title: "Enviar propuesta" }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.create_task" }));
  });

  it("update_task now passes workspaceId as the hardened first argument", async () => {
    updateTask.mockResolvedValue({ ok: true, data: { id: "task1" } });
    const tools = buildProjectTools(ctx);

    await tools.update_task.execute!({ task_id: "task1", status: "done" }, { toolCallId: "t1", messages: [] } as never);
    expect(updateTask).toHaveBeenCalledWith("ws1", "task1", { status: "done" });
  });

  it("update_task translates not_found_or_forbidden into a clear message", async () => {
    updateTask.mockResolvedValue({ ok: false, error: "not_found_or_forbidden" });
    const tools = buildProjectTools(ctx);

    const result = await tools.update_task.execute!({ task_id: "task1", status: "done" }, { toolCallId: "t1", messages: [] } as never);
    expect(result).toEqual({ ok: false, error: "No encontré esa tarea en esta empresa" });
  });

  it("assign_task calls reassignTask with workspaceId and logs an audit entry", async () => {
    reassignTask.mockResolvedValue({ ok: true, data: { id: "task1" } });
    const tools = buildProjectTools(ctx);

    const result = await tools.assign_task.execute!(
      { task_id: "task1", user_id: "11111111-1111-4111-8111-111111111111" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, task_id: "task1" });
    expect(reassignTask).toHaveBeenCalledWith("ws1", "task1", "11111111-1111-4111-8111-111111111111");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.assign_task" }));
  });

  it("assign_task surfaces 'responsable no pertenece' without logging an audit entry", async () => {
    reassignTask.mockResolvedValue({ ok: false, error: "El responsable no pertenece a la empresa activa" });
    const tools = buildProjectTools(ctx);

    const result = await tools.assign_task.execute!(
      { task_id: "task1", user_id: "11111111-1111-4111-8111-111111111111" },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toEqual({ ok: false, error: "El responsable no pertenece a la empresa activa" });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("create_subtask calls createSubtask with workspaceId and logs an audit entry", async () => {
    createSubtask.mockResolvedValue({ ok: true, data: { id: "sub1" } });
    const tools = buildProjectTools(ctx);

    const result = await tools.create_subtask.execute!(
      { task_id: "task1", title: "Revisar diseño" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, subtask_id: "sub1" });
    expect(createSubtask).toHaveBeenCalledWith("ws1", { task_id: "task1", title: "Revisar diseño" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.create_subtask" }));
  });

  it("complete_subtask toggles done and logs an audit entry", async () => {
    toggleSubtask.mockResolvedValue({ ok: true, data: null });
    const tools = buildProjectTools(ctx);

    const result = await tools.complete_subtask.execute!(
      { subtask_id: "sub1", done: true },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, subtask_id: "sub1" });
    expect(toggleSubtask).toHaveBeenCalledWith("ws1", "sub1", true);
  });

  it("search_subtasks filters returned rows to this workspace even if listSubtasks leaks a foreign row", async () => {
    listSubtasks.mockResolvedValue([
      { id: "sub1", workspace_id: "ws1", task_id: "task1", title: "Mía", done: false, assigned_to: null, position: 0, due_at: null, created_at: "", updated_at: "" },
      { id: "sub2", workspace_id: "ws-other", task_id: "task1", title: "Ajena", done: false, assigned_to: null, position: 1, due_at: null, created_at: "", updated_at: "" },
    ]);
    const tools = buildProjectTools(ctx);

    const result = await tools.search_subtasks.execute!({ task_id: "task1" }, { toolCallId: "t1", messages: [] } as never);
    expect(result).toEqual([{ subtask_id: "sub1", title: "Mía", done: false, assigned_to: null }]);
  });
});

describe("agenda-tools", () => {
  it("create_agenda_item succeeds and logs an audit entry", async () => {
    createAgendaTask.mockResolvedValue({ ok: true, data: { id: "a1" } });
    const tools = buildAgendaTools(ctx, createPendingConfirmationSlot());

    const result = await tools.create_agenda_item.execute!(
      { title: "Llamar a Ana", scheduled_date: "2026-08-10" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, agenda_item_id: "a1" });
    expect(createAgendaTask).toHaveBeenCalledWith("ws1", expect.objectContaining({ title: "Llamar a Ana", scheduled_date: "2026-08-10" }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.create_agenda_item" }));
  });

  it("complete_agenda_item toggles done and translates not_found_or_forbidden", async () => {
    toggleAgendaTaskDone.mockResolvedValue({ ok: false, error: "not_found_or_forbidden" });
    const tools = buildAgendaTools(ctx, createPendingConfirmationSlot());

    const result = await tools.complete_agenda_item.execute!(
      { agenda_item_id: "11111111-1111-4111-8111-111111111111", done: true },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toEqual({ ok: false, error: "No encontré esa tarea de agenda en esta empresa" });
  });

  it("search_agenda_items maps results to a minimal shape", async () => {
    searchAgendaTasks.mockResolvedValue([
      { id: "a1", title: "Llamar a Ana", scheduled_date: "2026-08-10", scheduled_week_start: null, done: false },
    ]);
    const tools = buildAgendaTools(ctx, createPendingConfirmationSlot());

    const result = await tools.search_agenda_items.execute!({ query: "Ana" }, { toolCallId: "t1", messages: [] } as never);
    expect(result).toEqual([{ agenda_item_id: "a1", title: "Llamar a Ana", scheduled_date: "2026-08-10", scheduled_week_start: null, done: false }]);
  });

  it("denies access when assertHelpActionAccess rejects, without calling the underlying service", async () => {
    assertHelpActionAccess.mockResolvedValue({ ok: false, reason: "plan_not_included" });
    const tools = buildAgendaTools(ctx, createPendingConfirmationSlot());

    const result = await tools.create_agenda_item.execute!(
      { title: "X", scheduled_date: "2026-08-10" },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toEqual({ ok: false, error: "denied:plan_not_included" });
    expect(createAgendaTask).not.toHaveBeenCalled();
  });

  const AGENDA_TASK_ID = "11111111-1111-4111-8111-111111111111";

  describe("cancel_agenda_item — Fase 4B: prepara, nunca ejecuta directamente", () => {
    it("prepares a confirmable action from the real row, without mutating agenda_tasks and without leaking the token to the model", async () => {
      getAgendaTaskById.mockResolvedValue({
        id: AGENDA_TASK_ID,
        title: "Llamar a Ana",
        scheduled_date: "2026-08-10",
        scheduled_week_start: null,
        cancelled_at: null,
      });
      prepareConfirmableAction.mockResolvedValue({ token: "raw-token-should-never-leak", expiresInSeconds: 300, pendingActionId: "pending-42" });
      const slot = createPendingConfirmationSlot();
      const tools = buildAgendaTools(ctx, slot);

      const result = await tools.cancel_agenda_item.execute!(
        { agenda_item_id: AGENDA_TASK_ID },
        { toolCallId: "t1", messages: [] } as never,
      );

      expect(result).toEqual({
        ok: true,
        requiresConfirmation: true,
        summary: "Vas a cancelar «Llamar a Ana», prevista para el 2026-08-10. Podrás restaurarla después.",
        expiresInSeconds: 300,
      });
      // El token NUNCA aparece en lo que la tool devuelve (lo que el modelo ve),
      // ni tampoco pendingActionId — no aporta nada a la interfaz.
      expect(JSON.stringify(result)).not.toContain("raw-token-should-never-leak");
      expect(JSON.stringify(result)).not.toContain("pending-42");
      // Sale únicamente por el slot compartido, para que help-assistant-service.ts lo lea sin pasar por OpenRouter.
      expect(slot.prepared).toEqual({ token: "raw-token-should-never-leak", expiresInSeconds: 300, summary: expect.stringContaining("Llamar a Ana") });
      expect(prepareConfirmableAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: "cancel_agenda_item", payload: { agenda_task_id: AGENDA_TASK_ID } }),
      );
      // targetId es el ID de la fila pendiente (identificador común de
      // auditoría con executed/cancelled) — el ID de Agenda queda solo en metadata.
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "help_assistant.action_prepared",
          targetType: "assistant_pending_action",
          targetId: "pending-42",
          metadata: expect.objectContaining({ agenda_task_id: AGENDA_TASK_ID }),
        }),
      );
    });

    it("enforces at most one confirmable preparation per request", async () => {
      getAgendaTaskById.mockResolvedValue({ id: AGENDA_TASK_ID, title: "X", scheduled_date: "2026-08-10", scheduled_week_start: null, cancelled_at: null });
      const slot = createPendingConfirmationSlot();
      slot.remaining = 0;
      const tools = buildAgendaTools(ctx, slot);

      const result = await tools.cancel_agenda_item.execute!(
        { agenda_item_id: AGENDA_TASK_ID },
        { toolCallId: "t1", messages: [] } as never,
      );

      expect(result).toEqual({ ok: false, error: expect.stringContaining("otra acción esperando confirmación") });
      expect(prepareConfirmableAction).not.toHaveBeenCalled();
    });

    it("refuses to prepare a cancellation for a task that's already cancelled", async () => {
      getAgendaTaskById.mockResolvedValue({ id: AGENDA_TASK_ID, title: "X", scheduled_date: "2026-08-10", scheduled_week_start: null, cancelled_at: "2026-08-01T00:00:00Z" });
      const tools = buildAgendaTools(ctx, createPendingConfirmationSlot());

      const result = await tools.cancel_agenda_item.execute!(
        { agenda_item_id: AGENDA_TASK_ID },
        { toolCallId: "t1", messages: [] } as never,
      );

      expect(result).toEqual({ ok: false, error: "Esa tarea ya está cancelada" });
      expect(prepareConfirmableAction).not.toHaveBeenCalled();
    });

    it("never mutates agenda_tasks directly — preparing is read-only", async () => {
      getAgendaTaskById.mockResolvedValue({ id: AGENDA_TASK_ID, title: "X", scheduled_date: "2026-08-10", scheduled_week_start: null, cancelled_at: null });
      prepareConfirmableAction.mockResolvedValue({ token: "t", expiresInSeconds: 300, pendingActionId: "pending-1" });
      const tools = buildAgendaTools(ctx, createPendingConfirmationSlot());

      await tools.cancel_agenda_item.execute!({ agenda_item_id: AGENDA_TASK_ID }, { toolCallId: "t1", messages: [] } as never);

      expect(updateAgendaTask).not.toHaveBeenCalled();
      expect(toggleAgendaTaskDone).not.toHaveBeenCalled();
    });
  });

  describe("restore_agenda_item — reversible, se ejecuta directamente sin confirmación", () => {
    it("restores and logs an audit entry", async () => {
      restoreAgendaTask.mockResolvedValue({ ok: true, data: { id: AGENDA_TASK_ID } });
      const tools = buildAgendaTools(ctx, createPendingConfirmationSlot());

      const result = await tools.restore_agenda_item.execute!(
        { agenda_item_id: AGENDA_TASK_ID },
        { toolCallId: "t1", messages: [] } as never,
      );

      expect(result).toEqual({ ok: true, agenda_item_id: AGENDA_TASK_ID });
      expect(restoreAgendaTask).toHaveBeenCalledWith("ws1", AGENDA_TASK_ID);
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.restore_agenda_item" }));
    });

    it("translates not_found_or_forbidden and never confuses it with a generic DB error", async () => {
      restoreAgendaTask.mockResolvedValue({ ok: false, error: "not_found_or_forbidden" });
      const tools = buildAgendaTools(ctx, createPendingConfirmationSlot());

      const result = await tools.restore_agenda_item.execute!(
        { agenda_item_id: AGENDA_TASK_ID },
        { toolCallId: "t1", messages: [] } as never,
      );

      expect(result).toEqual({ ok: false, error: "No encontré esa tarea de agenda cancelada en esta empresa" });
    });
  });
});

describe("note-tools", () => {
  it("create_note succeeds and logs an audit entry", async () => {
    createNote.mockResolvedValue({ ok: true, data: { id: "n1" } });
    const tools = buildNoteTools(ctx);

    const result = await tools.create_note.execute!(
      { title: "Reunión kickoff" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, note_id: "n1" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.create_note" }));
  });

  it("archive_note never calls a delete function — only setNoteArchived", async () => {
    setNoteArchived.mockResolvedValue({ ok: true, data: null });
    const tools = buildNoteTools(ctx);

    const result = await tools.archive_note.execute!(
      { note_id: "11111111-1111-4111-8111-111111111111", archived: true },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toEqual({ ok: true, note_id: "11111111-1111-4111-8111-111111111111" });
    expect(setNoteArchived).toHaveBeenCalledWith("ws1", "11111111-1111-4111-8111-111111111111", true);
  });

  it("update_note with content_text wraps it as a minimal valid Tiptap doc", async () => {
    updateNote.mockResolvedValue({ ok: true, data: null });
    const tools = buildNoteTools(ctx);

    await tools.update_note.execute!(
      { note_id: "11111111-1111-4111-8111-111111111111", content_text: "Hola mundo" },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(updateNote).toHaveBeenCalledWith(
      "ws1",
      "11111111-1111-4111-8111-111111111111",
      { title: undefined, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola mundo" }] }] } },
    );
  });

  it("update_note with title and content_text together makes a single combined updateNote call, not two writes", async () => {
    updateNote.mockResolvedValue({ ok: true, data: null });
    const tools = buildNoteTools(ctx);

    const result = await tools.update_note.execute!(
      { note_id: "11111111-1111-4111-8111-111111111111", title: "Nuevo título", content_text: "Hola mundo" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(updateNote).toHaveBeenCalledWith(
      "ws1",
      "11111111-1111-4111-8111-111111111111",
      { title: "Nuevo título", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola mundo" }] }] } },
    );
    expect(result).toEqual({ ok: true, note_id: "11111111-1111-4111-8111-111111111111" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.update_note" }));
  });

  it("update_note translates not_found_or_forbidden into a workspace-scoped Spanish message, and never audits on failure", async () => {
    updateNote.mockResolvedValue({ ok: false, error: "not_found_or_forbidden" });
    const tools = buildNoteTools(ctx);

    const result = await tools.update_note.execute!(
      { note_id: "11111111-1111-4111-8111-111111111111", title: "X" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: false, error: "No encontré esa anotación en esta empresa" });
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("content-tools", () => {
  function contentItem(overrides: Record<string, unknown> = {}) {
    return {
      id: "ci1",
      workspace_id: "ws1",
      title: "Reel de automatizaciones",
      version: 3,
      main_idea: null,
      description: null,
      content_type: null,
      platform: null,
      orientation: null,
      duration_estimate: null,
      scheduled_date: null,
      responsible_id: null,
      status: "idea",
      script_hook: null,
      script_body: null,
      script_closing: null,
      script_cta: null,
      bullet_points: [],
      reference_links: [],
      lighting_notes: null,
      music_notes: null,
      notes: null,
      ...overrides,
    };
  }

  it("create_content_idea succeeds and logs an audit entry — direct, no confirmation (fila nueva)", async () => {
    createContentItem.mockResolvedValue({ ok: true, data: { id: "ci1" } });
    const tools = buildContentTools(ctx, createPendingConfirmationSlot());

    const result = await tools.create_content_idea.execute!(
      { title: "Reel de automatizaciones" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, content_item_id: "ci1" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.create_content_idea" }));
  });

  it("get_content_item devuelve el contenido completo, incluida la versión, para un content_item_id del propio workspace", async () => {
    getContentItem.mockResolvedValue(contentItem({ main_idea: "Automatizaciones" }));
    const tools = buildContentTools(ctx, createPendingConfirmationSlot());

    const result = await tools.get_content_item.execute!({ content_item_id: "ci1" }, { toolCallId: "t1", messages: [] } as never);

    expect(result).toMatchObject({ ok: true, content_item_id: "ci1", element_version: 3, main_idea: "Automatizaciones" });
  });

  it("get_content_item rechaza un content_item_id de otro workspace", async () => {
    getContentItem.mockResolvedValue(contentItem({ workspace_id: "ws-other" }));
    const tools = buildContentTools(ctx, createPendingConfirmationSlot());

    const result = await tools.get_content_item.execute!({ content_item_id: "ci1" }, { toolCallId: "t1", messages: [] } as never);
    expect(result).toEqual({ ok: false, error: "No encontré esa pieza de contenido en esta empresa." });
  });

  it("move_content_status calls moveContentStatus with workspaceId and position 0", async () => {
    moveContentStatus.mockResolvedValue({ ok: true, data: null });
    const tools = buildContentTools(ctx, createPendingConfirmationSlot());

    const result = await tools.move_content_status.execute!(
      { content_item_id: "11111111-1111-4111-8111-111111111111", status: "in_production" },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toEqual({ ok: true, content_item_id: "11111111-1111-4111-8111-111111111111", status: "in_production" });
    expect(moveContentStatus).toHaveBeenCalledWith("ws1", "11111111-1111-4111-8111-111111111111", "in_production", 0);
  });

  describe("update_content_general / update_content_script — CAS y confirmación de sustitución", () => {
    it("rellenar un campo VACÍO es directo — nunca pide confirmación", async () => {
      getContentItem.mockResolvedValue(contentItem({ description: null }));
      updateContentItemFieldsCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 4 } });
      const slot = createPendingConfirmationSlot();
      const tools = buildContentTools(ctx, slot);

      const result = await tools.update_content_general.execute!(
        { content_item_id: "ci1", expected_version: 3, description: "Descripción nueva" },
        { toolCallId: "t1", messages: [] } as never,
      );

      expect(result).toEqual({ ok: true, content_item_id: "ci1", element_version: 4 });
      expect(updateContentItemFieldsCas).toHaveBeenCalledWith("ws1", "ci1", 3, expect.objectContaining({ description: "Descripción nueva" }));
      expect(slot.prepared).toBeNull();
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.update_content_general" }));
    });

    it("sustituir un campo que YA tenía contenido pide confirmación — nunca escribe directo", async () => {
      getContentItem.mockResolvedValue(contentItem({ description: "Descripción vieja" }));
      const slot = createPendingConfirmationSlot();
      const tools = buildContentTools(ctx, slot);

      const result = await tools.update_content_general.execute!(
        { content_item_id: "ci1", expected_version: 3, description: "Descripción nueva" },
        { toolCallId: "t1", messages: [] } as never,
      );

      expect(result).toMatchObject({ ok: true, requiresConfirmation: true });
      expect((result as { summary: string }).summary).toContain("Reel de automatizaciones");
      expect((result as { summary: string }).summary).toContain("breve descripción");
      expect(updateContentItemFieldsCas).not.toHaveBeenCalled();
      expect(slot.remaining).toBe(0);
      expect(slot.prepared).toMatchObject({ summary: expect.stringContaining("breve descripción") as unknown as string });
    });

    it("proponer el MISMO valor que ya tenía el campo no exige confirmación (no hay cambio real)", async () => {
      getContentItem.mockResolvedValue(contentItem({ description: "Igual" }));
      updateContentItemFieldsCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 4 } });
      const slot = createPendingConfirmationSlot();
      const tools = buildContentTools(ctx, slot);

      const result = await tools.update_content_general.execute!(
        { content_item_id: "ci1", expected_version: 3, description: "Igual" },
        { toolCallId: "t1", messages: [] } as never,
      );

      expect(result).toMatchObject({ ok: true });
      expect(slot.prepared).toBeNull();
    });

    it("expected_version desactualizada -> conflicto, nunca escribe ni prepara confirmación", async () => {
      getContentItem.mockResolvedValue(contentItem({ version: 9 }));
      const slot = createPendingConfirmationSlot();
      const tools = buildContentTools(ctx, slot);

      const result = await tools.update_content_general.execute!(
        { content_item_id: "ci1", expected_version: 3, title: "Nuevo título" },
        { toolCallId: "t1", messages: [] } as never,
      );

      expect(result).toEqual({ ok: false, error: expect.stringContaining("Vuelve a leerlo") });
      expect(updateContentItemFieldsCas).not.toHaveBeenCalled();
      expect(slot.prepared).toBeNull();
    });

    it("content_item_id de otro workspace -> no encontrado, nunca escribe", async () => {
      getContentItem.mockResolvedValue(contentItem({ workspace_id: "ws-other" }));
      const tools = buildContentTools(ctx, createPendingConfirmationSlot());

      const result = await tools.update_content_general.execute!(
        { content_item_id: "ci1", expected_version: 3, title: "X" },
        { toolCallId: "t1", messages: [] } as never,
      );
      expect(result).toEqual({ ok: false, error: expect.stringContaining("No encontré esa pieza de contenido") });
      expect(updateContentItemFieldsCas).not.toHaveBeenCalled();
    });

    it("responsable que no pertenece al workspace -> invalid_responsible, mensaje claro, nunca se confía en el ID sin verificar", async () => {
      getContentItem.mockResolvedValue(contentItem({ responsible_id: null }));
      updateContentItemFieldsCas.mockResolvedValue({ ok: true, data: { result: "invalid_responsible" } });
      const tools = buildContentTools(ctx, createPendingConfirmationSlot());

      const result = await tools.update_content_general.execute!(
        { content_item_id: "ci1", expected_version: 3, responsible_id: "22222222-2222-4222-8222-222222222222" },
        { toolCallId: "t1", messages: [] } as never,
      );
      expect(result).toEqual({ ok: false, error: expect.stringContaining("no pertenece a esta empresa") });
    });

    it("respeta el límite de una preparación confirmable por petición (compartido con Board/Agenda)", async () => {
      getContentItem.mockResolvedValue(contentItem({ description: "Vieja" }));
      const slot = createPendingConfirmationSlot();
      slot.remaining = 0;
      const tools = buildContentTools(ctx, slot);

      const result = await tools.update_content_general.execute!(
        { content_item_id: "ci1", expected_version: 3, description: "Nueva" },
        { toolCallId: "t1", messages: [] } as never,
      );
      expect(result).toMatchObject({ ok: false });
      expect(updateContentItemFieldsCas).not.toHaveBeenCalled();
    });

    it("update_content_script: rellenar el hook vacío es directo; sustituir uno ya escrito pide confirmación con los campos exactos", async () => {
      getContentItem.mockResolvedValue(contentItem({ script_hook: null, script_body: "Desarrollo ya escrito" }));
      updateContentItemFieldsCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 4 } });
      const slot = createPendingConfirmationSlot();
      const tools = buildContentTools(ctx, slot);

      // Solo rellena el hook (vacío) — directo.
      const directResult = await tools.update_content_script.execute!(
        { content_item_id: "ci1", expected_version: 3, hook: "Hook nuevo" },
        { toolCallId: "t1", messages: [] } as never,
      );
      expect(directResult).toEqual({ ok: true, content_item_id: "ci1", element_version: 4 });

      // Ahora sustituye el desarrollo (ya tenía contenido) — pide confirmación.
      const confirmResult = await tools.update_content_script.execute!(
        { content_item_id: "ci1", expected_version: 3, body: "Desarrollo nuevo" },
        { toolCallId: "t2", messages: [] } as never,
      );
      expect(confirmResult).toMatchObject({ ok: true, requiresConfirmation: true });
      expect((confirmResult as { summary: string }).summary).toContain("desarrollo");
    });

    it("update_content_script aplicando una propuesta de generate_content_script sigue pidiendo confirmación si sustituye contenido real", async () => {
      getContentItem.mockResolvedValue(contentItem({ script_hook: "Hook viejo" }));
      const slot = createPendingConfirmationSlot();
      const tools = buildContentTools(ctx, slot);

      const result = await tools.update_content_script.execute!(
        { content_item_id: "ci1", expected_version: 3, hook: "Hook propuesto por generate_content_script" },
        { toolCallId: "t1", messages: [] } as never,
      );
      expect(result).toMatchObject({ ok: true, requiresConfirmation: true });
    });
  });

  describe("generate_content_script", () => {
    it("returns a proposal without saving — never calls updateContentItem/updateContentItemFieldsCas", async () => {
      getContentItem.mockResolvedValue(contentItem({
        main_idea: "Automatizaciones",
        description: "3 trucos",
        content_type: "Reel",
        platform: "Instagram",
        orientation: "vertical",
        duration_estimate: "30s",
      }));
      generateContentScript.mockResolvedValue({
        ok: true,
        data: { hook: "H", body: "B", closing: "C", cta: "CTA", bulletPoints: [], links: [], lighting: "L", music: "M", notes: "" },
      });
      const tools = buildContentTools(ctx, createPendingConfirmationSlot());

      const result = await tools.generate_content_script.execute!(
        { content_item_id: "ci1" },
        { toolCallId: "t1", messages: [] } as never,
      );

      expect(result).toMatchObject({ ok: true, content_item_id: "ci1" });
      expect(updateContentItem).not.toHaveBeenCalled();
      expect(updateContentItemFieldsCas).not.toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.generate_content_script" }));
    });

    it("rejects a content_item_id from another workspace", async () => {
      getContentItem.mockResolvedValue(contentItem({ workspace_id: "ws-other" }));
      const tools = buildContentTools(ctx, createPendingConfirmationSlot());

      const result = await tools.generate_content_script.execute!(
        { content_item_id: "ci1" },
        { toolCallId: "t1", messages: [] } as never,
      );
      expect(result).toEqual({ ok: false, error: "No encontré esa pieza de contenido en esta empresa" });
      expect(generateContentScript).not.toHaveBeenCalled();
    });

    it("cuando la integración OpenRouter del cliente no está conectada, devuelve un mensaje controlado — nunca intenta con otra clave", async () => {
      getContentItem.mockResolvedValue(contentItem());
      generateContentScript.mockResolvedValue({ ok: false, error: "Conecta OpenRouter en Ajustes → Integraciones para generar guiones con IA." });
      const tools = buildContentTools(ctx, createPendingConfirmationSlot());

      const result = await tools.generate_content_script.execute!({ content_item_id: "ci1" }, { toolCallId: "t1", messages: [] } as never);
      expect(result).toEqual({ ok: false, error: expect.stringContaining("OpenRouter") });
    });

    it("cuando el rate limit del cliente está agotado, devuelve un mensaje controlado — fail-closed, nunca genera igualmente", async () => {
      getContentItem.mockResolvedValue(contentItem());
      generateContentScript.mockResolvedValue({ ok: false, error: "Se alcanzó el límite de generaciones de guion por esta hora. Inténtalo más tarde." });
      const tools = buildContentTools(ctx, createPendingConfirmationSlot());

      const result = await tools.generate_content_script.execute!({ content_item_id: "ci1" }, { toolCallId: "t1", messages: [] } as never);
      expect(result).toEqual({ ok: false, error: expect.stringContaining("límite") });
    });

    it("allows at most one generation per buildContentTools() instance (one user petición)", async () => {
      getContentItem.mockResolvedValue(contentItem());
      generateContentScript.mockResolvedValue({
        ok: true,
        data: { hook: "H", body: "B", closing: "C", cta: "CTA", bulletPoints: [], links: [], lighting: "L", music: "M", notes: "" },
      });
      const tools = buildContentTools(ctx, createPendingConfirmationSlot());

      const first = (await tools.generate_content_script.execute!({ content_item_id: "ci1" }, { toolCallId: "t1", messages: [] } as never)) as { ok: boolean };
      expect(first.ok).toBe(true);
      expect(generateContentScript).toHaveBeenCalledTimes(1);

      const second = (await tools.generate_content_script.execute!({ content_item_id: "ci1" }, { toolCallId: "t2", messages: [] } as never)) as { ok: boolean };
      expect(second.ok).toBe(false);
      // Still only ever called once — the second attempt never reaches the provider.
      expect(generateContentScript).toHaveBeenCalledTimes(1);
    });

    it("a NEW buildContentTools() call (new user petición) resets the once-per-request guard", async () => {
      getContentItem.mockResolvedValue(contentItem());
      generateContentScript.mockResolvedValue({
        ok: true,
        data: { hook: "H", body: "B", closing: "C", cta: "CTA", bulletPoints: [], links: [], lighting: "L", music: "M", notes: "" },
      });

      const firstRequestTools = buildContentTools(ctx, createPendingConfirmationSlot());
      await firstRequestTools.generate_content_script.execute!({ content_item_id: "ci1" }, { toolCallId: "t1", messages: [] } as never);

      const secondRequestTools = buildContentTools(ctx, createPendingConfirmationSlot());
      const result = (await secondRequestTools.generate_content_script.execute!({ content_item_id: "ci1" }, { toolCallId: "t2", messages: [] } as never)) as { ok: boolean };
      expect(result.ok).toBe(true);
      expect(generateContentScript).toHaveBeenCalledTimes(2);
    });
  });
});
