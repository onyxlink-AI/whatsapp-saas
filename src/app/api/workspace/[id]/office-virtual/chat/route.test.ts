// Proof that the real chat route stays gated the same way every other real
// Oficina Virtual data route is (requireOfficeVirtualReader), rejects a
// malformed body before touching the service, and relays the service's
// coordinator/delegation result — or its refusal reason — unmodified.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const requireOfficeVirtualReader = vi.fn();
const readJsonBody = vi.fn();
const handleCoordinatorMessage = vi.fn();
const getWorkspaceOpenRouterCredential = vi.fn();
const generateText = vi.fn();
const searchContentItems = vi.fn();
const createContentItem = vi.fn();
const resolveResponsibleMemberId = vi.fn();
const writeContentFieldsWithConfirmation = vi.fn();
const logAudit = vi.fn();

vi.mock('@/features/office-virtual/server/office-virtual-access', () => ({ requireOfficeVirtualReader }));
vi.mock('@/lib/auth/workspace-access', () => ({ readJsonBody }));
vi.mock('@/features/office-virtual/server/real-chat-service', async () => {
  const actual = await vi.importActual<typeof import('@/features/office-virtual/server/real-chat-service')>(
    '@/features/office-virtual/server/real-chat-service',
  );
  return { ...actual, handleCoordinatorMessage };
});
vi.mock('@/features/office-virtual/server/real-integration-status', () => ({ resolveRealIntegrationStatuses: vi.fn() }));
vi.mock('@/features/content/services/openrouter-credential', () => ({ getWorkspaceOpenRouterCredential }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: () => ({ chat: (modelId: string) => ({ modelId }) }) }));
vi.mock('ai', () => ({ generateText: (...a: unknown[]) => generateText(...a) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('@/features/content/services/content-actions', () => ({
  searchContentItems: (...a: unknown[]) => searchContentItems(...a),
  createContentItem: (...a: unknown[]) => createContentItem(...a),
}));
vi.mock('@/features/office-virtual/server/office-content-mapping', async () => {
  const actual = await vi.importActual<typeof import('@/features/office-virtual/server/office-content-mapping')>(
    '@/features/office-virtual/server/office-content-mapping',
  );
  // contentFieldsToPatch stays REAL (pure mapping, already covered by its
  // own dedicated tests) — only the DB-touching resolver is mocked here.
  return { ...actual, resolveResponsibleMemberId: (...a: unknown[]) => resolveResponsibleMemberId(...a) };
});
vi.mock('@/features/help-assistant/services/action-tools/content-tools', () => ({
  writeContentFieldsWithConfirmation: (...a: unknown[]) => writeContentFieldsWithConfirmation(...a),
}));
vi.mock('@/features/help-assistant/services/pending-actions', () => ({
  createPendingConfirmationSlot: () => ({ remaining: 1, prepared: null }),
}));
vi.mock('@/features/audit/services/audit-log', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const { POST, officeVirtualGenerateReply, contentPorts } = await import('./route');

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/workspace/[id]/office-virtual/chat', () => {
  it('rejects a caller who fails the same Oficina Virtual reader gate as the rest of the feature', async () => {
    requireOfficeVirtualReader.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Oficina Virtual no está activada para este workspace' }), { status: 409 }),
    });

    const res = await POST(request({ message: 'hola' }), params('empresa-a'));
    expect(res.status).toBe(409);
    expect(handleCoordinatorMessage).not.toHaveBeenCalled();
  });

  it('rejects an empty message before touching the service', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    readJsonBody.mockResolvedValue({ ok: true, body: { message: '', history: [] } });

    const res = await POST(request({ message: '' }), params('empresa-a'));
    expect(res.status).toBe(400);
    expect(handleCoordinatorMessage).not.toHaveBeenCalled();
  });

  it('relays a successful coordinator reply with its delegation', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    readJsonBody.mockResolvedValue({ ok: true, body: { message: 'Necesito una propuesta', history: [] } });
    handleCoordinatorMessage.mockResolvedValue({
      success: true,
      coordinatorText: 'Se lo paso a Marco.',
      delegation: { agentId: 'specialist-1', specialistName: 'Marco', text: 'Aquí está la propuesta.' },
    });

    const res = await POST(request({ message: 'Necesito una propuesta' }), params('empresa-a'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.coordinatorText).toBe('Se lo paso a Marco.');
    expect(body.delegation.specialistName).toBe('Marco');
  });

  it('surfaces a missing-API-key refusal as 409 with a readable message, not a 500', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    readJsonBody.mockResolvedValue({ ok: true, body: { message: 'hola', history: [] } });
    handleCoordinatorMessage.mockResolvedValue({ success: false, code: 'api_key_missing' });

    const res = await POST(request({ message: 'hola' }), params('empresa-a'));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });
});

// BLOQUEO 1 punto 7 — reproducción del hallazgo real de esta revisión:
// generateChatReply()/getOpenRouterApiKey() de inbox/services/openrouter.ts
// caen en silencio a process.env.OPENROUTER_API_KEY si la lectura de la
// integración del workspace falla — inaceptable para el Orquestador/
// especialistas de la Oficina Virtual. officeVirtualGenerateReply() usa en
// su lugar el resolvedor estricto compartido (openrouter-credential.ts,
// el mismo que "Generar guion con IA") y NUNCA llama al modelo sin una
// integración 'ready' de ESE workspace.
describe('officeVirtualGenerateReply — nunca usa la clave de plataforma', () => {
  it('llama al modelo con la clave real del workspace cuando la integración está lista', async () => {
    getWorkspaceOpenRouterCredential.mockResolvedValue({ status: 'ready', apiKey: 'sk-or-workspace-real-key' });
    generateText.mockResolvedValue({ text: 'respuesta real' });

    const result = await officeVirtualGenerateReply({
      model: 'anthropic/claude-opus-4.8',
      systemPrompt: 'eres un asistente',
      messages: [{ role: 'user', content: 'hola' }],
      workspaceId: 'empresa-a',
    });

    expect(getWorkspaceOpenRouterCredential).toHaveBeenCalledWith('empresa-a');
    expect(result.text).toBe('respuesta real');
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it.each(['not_configured', 'disabled', 'decrypt_error', 'error'] as const)(
    "nunca llama al modelo cuando la integración del workspace está '%s' — nunca cae a una clave global",
    async (status) => {
      getWorkspaceOpenRouterCredential.mockResolvedValue({ status });

      await expect(
        officeVirtualGenerateReply({
          model: 'anthropic/claude-opus-4.8',
          systemPrompt: 'eres un asistente',
          messages: [],
          workspaceId: 'empresa-a',
        }),
      ).rejects.toThrow();

      expect(generateText).not.toHaveBeenCalled();
    },
  );
});

// Cierre de producción — "Revisión específica obligatoria" (paso 6 del
// runbook de despliegue). Cada caso reproduce, con pruebas reales, una
// garantía exigida antes de tocar producción.
describe('contentPorts().create — un solo INSERT completo, nunca fila parcial, nunca auditoría en fallo', () => {
  it('hace una única llamada a createContentItem (un solo INSERT) — nunca crea y luego parchea', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    createContentItem.mockResolvedValue({ ok: true, data: { id: 'content-1' } });

    const result = await contentPorts().create('workspace-a', 'user-1', { title: 'Guion nuevo', script_hook: 'Hook' });

    expect(createContentItem).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('created');
    expect(resolveResponsibleMemberId).not.toHaveBeenCalled(); // sin responsable indicado — nunca se intenta resolver
  });

  it('si el INSERT falla, no hay ninguna fila parcial (un único intento) y no se registra auditoría', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    createContentItem.mockResolvedValue({ ok: false, error: 'Error al crear el contenido' });

    const result = await contentPorts().create('workspace-a', 'user-1', { title: 'Guion nuevo' });

    expect(result).toEqual({ kind: 'error', error: 'Error al crear el contenido' });
    expect(createContentItem).toHaveBeenCalledTimes(1); // un único intento — ninguna segunda escritura de "reparación"
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('sin responsable indicado, la creación se permite con normalidad', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    createContentItem.mockResolvedValue({ ok: true, data: { id: 'content-1' } });

    const result = await contentPorts().create('workspace-a', 'user-1', { title: 'Sin responsable' });

    expect(result.kind).toBe('created');
    expect(resolveResponsibleMemberId).not.toHaveBeenCalled();
    expect(createContentItem).toHaveBeenCalledWith('workspace-a', expect.not.objectContaining({ responsible_id: expect.anything() }));
  });

  it('responsable inexistente: la creación se rechaza — cero INSERT, cero auditoría', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    resolveResponsibleMemberId.mockResolvedValue({ ok: false, code: 'responsible_not_found' });

    const result = await contentPorts().create('workspace-a', 'user-1', { title: 'x', responsible_name: 'Nombre Inventado' });

    expect(result.kind).toBe('error');
    expect(createContentItem).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('responsable ambiguo: la creación se rechaza con un mensaje distinto de "no encontrado"', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    resolveResponsibleMemberId.mockResolvedValue({ ok: false, code: 'responsible_ambiguous' });

    const result = await contentPorts().create('workspace-a', 'user-1', { title: 'x', responsible_name: 'Ana' });

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).not.toMatch(/no pertenece|no encontrad/i);
    }
    expect(createContentItem).not.toHaveBeenCalled();
  });

  it('error de BD comprobando el responsable: mensaje de error TEMPORAL, nunca "no encontrado"', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    resolveResponsibleMemberId.mockResolvedValue({ ok: false, code: 'database_error' });

    const result = await contentPorts().create('workspace-a', 'user-1', { title: 'x', responsible_name: 'Ana' });

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toMatch(/no se pudo comprobar|inténtalo de nuevo/i);
      expect(result.error).not.toMatch(/no pertenece|no encontrad/i);
    }
    expect(createContentItem).not.toHaveBeenCalled();
  });

  it('un responsable inactivo (excluido por la propia consulta workspace-scoped) se trata igual que "no encontrado" — rechazo', async () => {
    // office-content-mapping.ts ya filtra is_active=true en el SQL — un
    // miembro inactivo nunca aparece entre las filas devueltas, así que
    // resuelve exactamente como "responsible_not_found" (ver su propio
    // test suite dedicado). Aquí se confirma que el puerto lo RECHAZA.
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    resolveResponsibleMemberId.mockResolvedValue({ ok: false, code: 'responsible_not_found' });

    const result = await contentPorts().create('workspace-a', 'user-1', { title: 'x', responsible_name: 'Miembro Inactivo' });

    expect(result.kind).toBe('error');
    expect(createContentItem).not.toHaveBeenCalled();
  });

  it('nunca publica ni marca como publicado — el puerto no envía ningún status y createContentItem siempre fuerza "idea"', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    createContentItem.mockResolvedValue({ ok: true, data: { id: 'content-1' } });

    await contentPorts().create('workspace-a', 'user-1', { title: 'x' });

    const sentInput = createContentItem.mock.calls[0][1] as Record<string, unknown>;
    expect(sentInput.status).toBeUndefined(); // nunca se envía un status — createContentItem lo fuerza a 'idea' él mismo
  });
});

describe('contentPorts().update — responsable inválido nunca escribe nada', () => {
  it('responsable inválido: cero escrituras — ni siquiera se llama a writeContentFieldsWithConfirmation', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    resolveResponsibleMemberId.mockResolvedValue({ ok: false, code: 'responsible_not_found' });

    const result = await contentPorts().update('workspace-a', 'user-1', 'content-1', 3, { responsible_name: 'Nombre Inventado' });

    expect(result.kind).toBe('error');
    expect(writeContentFieldsWithConfirmation).not.toHaveBeenCalled();
  });

  it('con un responsable válido, sí llega a escribir vía writeContentFieldsWithConfirmation', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    resolveResponsibleMemberId.mockResolvedValue({ ok: true, userId: 'user-2' });
    writeContentFieldsWithConfirmation.mockResolvedValue({ kind: 'written', version: 4 });

    const result = await contentPorts().update('workspace-a', 'user-1', 'content-1', 3, { responsible_name: 'Ana López' });

    expect(writeContentFieldsWithConfirmation).toHaveBeenCalledWith(
      { workspaceId: 'workspace-a', actorUserId: 'user-1' },
      expect.anything(),
      'content-1',
      3,
      expect.objectContaining({ responsible_id: 'user-2' }),
    );
    expect(result).toEqual({ kind: 'updated', contentItemId: 'content-1', version: 4 });
  });
});

describe('cierre de producción — aislamiento A/B a través de los puertos de contenido', () => {
  it('search() nunca mezcla resultados de otro workspace — pasa el workspaceId tal cual a searchContentItems, que ya es workspace-scoped', async () => {
    searchContentItems.mockResolvedValue([{ id: 'c-1', title: 'x', status: 'idea', version: 1 }]);
    await contentPorts().search('workspace-a', 'algo');
    expect(searchContentItems).toHaveBeenCalledWith('workspace-a', 'algo');
    expect(searchContentItems).not.toHaveBeenCalledWith('workspace-b', expect.anything());
  });

  it('create()/update() re-verifican el acceso a ESE workspace exacto antes de escribir — un fallo de esa comprobación bloquea la escritura', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: false, response: new Response('{}', { status: 409 }) });

    const created = await contentPorts().create('workspace-b', 'user-1', { title: 'x' });
    expect(created.kind).toBe('error');
    expect(createContentItem).not.toHaveBeenCalled();

    const updated = await contentPorts().update('workspace-b', 'user-1', 'content-1', 1, { notes: 'x' });
    expect(updated.kind).toBe('error');
    expect(writeContentFieldsWithConfirmation).not.toHaveBeenCalled();
  });
});
