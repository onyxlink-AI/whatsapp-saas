// Proof that talking to the Orquestador is a real, model-backed flow: it
// refuses to run without a real API key/model, it only ever delegates to a
// specialist that is genuinely enabled+published, a hallucinated agent id
// degrades to "coordinator answered directly" instead of crashing, the
// workspace's current date/time and custom instructions actually reach the
// model, and a specialist can only really write to the Agenda when its own
// configured allowedActions grant it — never just because it emitted the tag.

import { describe, expect, it, vi } from 'vitest';
import { handleCoordinatorMessage, type AgendaPorts, type ContentPorts, type ContentSearchResult, type RealChatServicePorts } from './real-chat-service';
import type { OfficeConfigurationHead, OfficeConfigurationStore } from './office-configuration-service';
import type { OrchestratorStore } from './orchestrator-service';
import type { OfficeConfigurationDocument, OfficeSpecialistConfiguration } from '../client/central-integrations/configuration';
import type { WorkspaceOrchestratorBinding } from '../client/central-orchestrator';
import { CONFIGURABLE_AGENT_IDS, DEFAULT_SPECIALIST_COLORS, type ConfigurableOfficeAgentId } from '../client/central-integrations/specialist-seats';

const NOW_CONTEXT = '## Fecha actual\nHoy es viernes, 31 de julio de 2026 (zona horaria Europe/Madrid, offset +02:00).';

function specialist(agentId: ConfigurableOfficeAgentId, overrides: Partial<OfficeSpecialistConfiguration> = {}): OfficeSpecialistConfiguration {
  return {
    agentId,
    enabled: false,
    templateId: null,
    name: agentId,
    color: DEFAULT_SPECIALIST_COLORS[agentId],
    function: 'Sin función',
    objective: 'Sin objetivo',
    instructions: 'Sin instrucciones',
    clientLayer: '',
    model: null,
    extensions: [],
    skills: [],
    allowedActions: ['read_contacts'],
    approvalPolicy: 'sensitive_only',
    ...overrides,
  };
}

function document(overrides: Partial<OfficeConfigurationDocument> = {}): OfficeConfigurationDocument {
  return {
    workspaceId: 'workspace-a',
    presetId: 'standard-virtual-office',
    presetVersion: '2.0.0',
    revision: 1,
    status: 'published',
    officeDisplayName: 'Onyxlink oficina',
    sectorId: null,
    specialists: Object.fromEntries(CONFIGURABLE_AGENT_IDS.map((id) => [id, specialist(id)])) as Record<ConfigurableOfficeAgentId, OfficeSpecialistConfiguration>,
    updatedAt: '2026-07-30T00:00:00.000Z',
    updatedBy: 'onyxlink.ai@gmail.com',
    ...overrides,
  };
}

function fakePorts(opts: {
  doc: OfficeConfigurationDocument;
  binding: WorkspaceOrchestratorBinding | null;
  reply: (systemPrompt: string) => string;
  /** Mirrors orchestrator-service.ts's overlay: this is the ONLY thing that decides hasApiKey/status — the raw binding's own values are always superseded. */
  realOpenRouterStatus?: 'not_configured' | 'needs_attention' | 'configured' | 'verified';
  agenda?: AgendaPorts;
  content?: ContentPorts;
  nowContext?: string;
}): RealChatServicePorts {
  const configStore: OfficeConfigurationStore = {
    async loadHead() {
      return {
        presetId: opts.doc.presetId,
        presetVersion: opts.doc.presetVersion,
        revision: opts.doc.revision,
        status: opts.doc.status,
        document: opts.doc,
        updatedAt: opts.doc.updatedAt,
        updatedBy: opts.doc.updatedBy,
      } satisfies OfficeConfigurationHead;
    },
    async saveHead() {},
    async appendRevision() {},
    async loadRevisionDocument() {
      return null;
    },
  };

  const orchestratorStore: OrchestratorStore = {
    async loadBinding() {
      return opts.binding;
    },
    async saveBinding() {},
  };

  return {
    configuration: { store: configStore, resolveOpenRouterConnected: async () => true },
    orchestrator: { store: orchestratorStore, resolveRealOpenRouterStatus: async () => opts.realOpenRouterStatus ?? 'configured' },
    generateReply: vi.fn(async ({ systemPrompt }) => ({ text: opts.reply(systemPrompt) })),
    agenda: opts.agenda ?? { createTask: vi.fn(async () => ({ meetingLink: null })) },
    content: opts.content ?? {
      search: vi.fn(async (): Promise<ContentSearchResult[]> => []),
      create: vi.fn(async () => ({ kind: 'error' as const, error: 'not wired in this test' })),
      update: vi.fn(async () => ({ kind: 'error' as const, error: 'not wired in this test' })),
    },
    resolveNowContext: async () => opts.nowContext ?? NOW_CONTEXT,
  };
}

function binding(overrides: Partial<WorkspaceOrchestratorBinding['openrouter']> = {}, customInstructions = ''): WorkspaceOrchestratorBinding {
  return {
    workspaceId: 'workspace-a',
    activeMode: 'openrouter',
    openrouter: {
      mode: 'openrouter',
      model: 'anthropic/claude-opus-4.8',
      fallbackModel: null,
      costProfile: 'balanced',
      dailyRequestLimit: null,
      monthlyRequestLimit: null,
      allowPremiumModels: true,
      agentOverrides: {},
      status: 'connected',
      hasApiKey: true,
      statusDetail: null,
      updatedAt: '2026-07-30T00:00:00.000Z',
      updatedBy: 'onyxlink.ai@gmail.com',
      ...overrides,
    },
    hermesTelegram: {
      mode: 'hermes_telegram',
      endpoint: null,
      connectionId: null,
      botId: null,
      status: 'not_configured',
      hasSecret: false,
      statusDetail: null,
      updatedAt: '2026-07-30T00:00:00.000Z',
      updatedBy: 'system',
    },
    customInstructions,
    revision: 1,
  };
}

describe('real chat service — guards', () => {
  it('refuses to run when OpenRouter has no API key, without ever calling the model', async () => {
    // hasApiKey/status are never trusted from the persisted binding — they're
    // always re-derived live (see orchestrator-service.ts's overlay) — so
    // what actually drives this is the real signal, not the raw binding.
    const generateReply = vi.fn();
    const ports = fakePorts({ doc: document(), binding: binding(), realOpenRouterStatus: 'not_configured', reply: () => '' });
    ports.generateReply = generateReply;

    const result = await handleCoordinatorMessage('workspace-a', [], 'hola', null, ports);

    expect(result).toEqual({ success: false, code: 'api_key_missing' });
    expect(generateReply).not.toHaveBeenCalled();
  });

  it('refuses to run when no model is configured', async () => {
    const ports = fakePorts({ doc: document(), binding: binding({ model: null, fallbackModel: null }), reply: () => '' });
    const result = await handleCoordinatorMessage('workspace-a', [], 'hola', null, ports);
    expect(result).toEqual({ success: false, code: 'model_missing' });
  });

  it('falls back to fallbackModel when the primary model is unset', async () => {
    const ports = fakePorts({
      doc: document(),
      binding: binding({ model: null, fallbackModel: 'openai/gpt-4.1-mini' }),
      reply: () => 'Respuesta directa, sin delegar.',
    });
    const result = await handleCoordinatorMessage('workspace-a', [], 'hola', null, ports);
    expect(result.success).toBe(true);
  });
});

describe('real chat service — delegation', () => {
  it('answers directly when no specialist is published (never hallucinates one to delegate to)', async () => {
    const doc = document(); // all specialists disabled/unpublished by default
    const ports = fakePorts({ doc, binding: binding(), reply: () => 'Puedo ayudarte yo mismo con eso.' });

    const result = await handleCoordinatorMessage('workspace-a', [], 'Necesito un resumen', null, ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.coordinatorText).toBe('Puedo ayudarte yo mismo con eso.');
    expect(result.delegation).toBeNull();
  });

  it('delegates to a genuinely enabled+published specialist and returns its real reply', async () => {
    const doc = document({
      specialists: {
        ...document().specialists,
        'specialist-1': specialist('specialist-1', {
          enabled: true,
          name: 'Marco',
          function: 'Propuestas',
          objective: 'Preparar propuestas comerciales',
          instructions: 'Redacta propuestas claras y concisas.',
        }),
      },
    });

    const ports = fakePorts({
      doc,
      binding: binding(),
      reply: (systemPrompt) => {
        if (systemPrompt.includes('Eres el Orquestador')) {
          return 'Se lo paso a Marco.\n<delegate agent="specialist-1">Prepara una propuesta para el cliente X</delegate>';
        }
        return 'Aquí tienes la propuesta redactada para el cliente X.';
      },
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'Necesito una propuesta', null, ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.coordinatorText).toBe('Se lo paso a Marco.');
    expect(result.delegation).toEqual({
      agentId: 'specialist-1',
      specialistName: 'Marco',
      text: 'Aquí tienes la propuesta redactada para el cliente X.',
      agendaTask: null,
      content: null,
    });
  });

  it("uses the specialist's own model override for its real call, not the workspace default", async () => {
    const doc = document({
      specialists: {
        ...document().specialists,
        'specialist-1': specialist('specialist-1', {
          enabled: true,
          name: 'Marco',
          model: 'openai/gpt-5.4-mini',
        }),
      },
    });

    const generateReply = vi.fn(async ({ model, systemPrompt }: { model: string; systemPrompt: string }) => ({
      text: systemPrompt.includes('Eres el Orquestador')
        ? 'Se lo paso a Marco.\n<delegate agent="specialist-1">tarea</delegate>'
        : 'listo',
    }));
    const ports = fakePorts({ doc, binding: binding({ model: 'anthropic/claude-opus-4.8' }), reply: () => '' });
    ports.generateReply = generateReply;

    await handleCoordinatorMessage('workspace-a', [], 'algo', null, ports);

    expect(generateReply).toHaveBeenCalledTimes(2);
    expect(generateReply.mock.calls[0][0].model).toBe('anthropic/claude-opus-4.8'); // coordinator: workspace default
    expect(generateReply.mock.calls[1][0].model).toBe('openai/gpt-5.4-mini'); // specialist: its own override
  });

  it('falls back to the workspace default model when a specialist has no override of its own', async () => {
    const doc = document({
      specialists: {
        ...document().specialists,
        'specialist-1': specialist('specialist-1', { enabled: true, name: 'Marco' }), // model: null (default)
      },
    });

    const generateReply = vi.fn(async ({ systemPrompt }: { model: string; systemPrompt: string }) => ({
      text: systemPrompt.includes('Eres el Orquestador')
        ? 'Se lo paso a Marco.\n<delegate agent="specialist-1">tarea</delegate>'
        : 'listo',
    }));
    const ports = fakePorts({ doc, binding: binding({ model: 'anthropic/claude-opus-4.8' }), reply: () => '' });
    ports.generateReply = generateReply;

    await handleCoordinatorMessage('workspace-a', [], 'algo', null, ports);

    expect(generateReply.mock.calls[1][0].model).toBe('anthropic/claude-opus-4.8');
  });

  it('ignores a delegation to a specialist that is not enabled/published — never invents an agent', async () => {
    const doc = document(); // specialist-1 exists in the schema but enabled: false
    const generateReply = vi.fn(async ({ systemPrompt }: { systemPrompt: string }) => ({
      text: systemPrompt.includes('Eres el Orquestador')
        ? 'Se lo paso a alguien.\n<delegate agent="specialist-1">tarea</delegate>'
        : 'no debería llamarse',
    }));
    const ports = fakePorts({ doc, binding: binding(), reply: () => '' });
    ports.generateReply = generateReply;

    const result = await handleCoordinatorMessage('workspace-a', [], 'algo', null, ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.delegation).toBeNull();
    expect(result.coordinatorText).toBe('Se lo paso a alguien.');
    expect(generateReply).toHaveBeenCalledTimes(1); // never made the second (specialist) call
  });
});

describe('real chat service — custom instructions and current date/time', () => {
  it('injects the workspace-configured custom instructions into the coordinator system prompt', async () => {
    const doc = document();
    let sawInstructions = false;
    const ports = fakePorts({
      doc,
      binding: binding({}, 'Cuando falte el año, asume el más próximo en el futuro.'),
      reply: (systemPrompt) => {
        sawInstructions = systemPrompt.includes('Cuando falte el año, asume el más próximo en el futuro.');
        return 'ok';
      },
    });

    await handleCoordinatorMessage('workspace-a', [], 'hola', null, ports);
    expect(sawInstructions).toBe(true);
  });

  it('injects the resolved current-date context into both the coordinator and the specialist prompt', async () => {
    const doc = document({
      specialists: {
        ...document().specialists,
        'specialist-1': specialist('specialist-1', { enabled: true, name: 'Marco' }),
      },
    });
    const seenPrompts: string[] = [];
    const ports = fakePorts({
      doc,
      binding: binding(),
      nowContext: NOW_CONTEXT,
      reply: (systemPrompt) => {
        seenPrompts.push(systemPrompt);
        return systemPrompt.includes('Eres el Orquestador')
          ? 'Se lo paso a Marco.\n<delegate agent="specialist-1">tarea</delegate>'
          : 'listo';
      },
    });

    await handleCoordinatorMessage('workspace-a', [], 'hola', null, ports);
    expect(seenPrompts).toHaveLength(2);
    expect(seenPrompts.every((p) => p.includes(NOW_CONTEXT))).toBe(true);
  });
});

describe('real chat service — real Agenda tool', () => {
  function agendaSpecialistDoc() {
    return document({
      specialists: {
        ...document().specialists,
        'specialist-1': specialist('specialist-1', {
          enabled: true,
          name: 'Ana',
          function: 'Agendar llamadas y organizar tareas',
          allowedActions: ['read_contacts', 'read_memory', 'schedule_call', 'create_task'],
        }),
      },
    });
  }

  it('really persists the appointment when a specialist with schedule_call/create_task confirms it, including the generated Meet link', async () => {
    const createTask = vi.fn(async () => ({ meetingLink: 'https://meet.google.com/abc-defg-hij' }));
    const ports = fakePorts({
      doc: agendaSpecialistDoc(),
      binding: binding(),
      agenda: { createTask },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? 'Se lo paso a Ana.\n<delegate agent="specialist-1">Agenda la llamada con Antonio Fernández mañana a las 11</delegate>'
          : 'Confirmada y cerrada.\n<agenda_task title="Llamada con Antonio Fernández" date="2026-08-01" start="11:00" end="11:30">Visita de mantenimiento</agenda_task>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'Agenda una llamada con Antonio Fernández mañana a las 11', 'user-1', ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.delegation?.text).toBe('Confirmada y cerrada.'); // tag stripped from visible text
    expect(result.delegation?.agendaTask).toEqual({
      title: 'Llamada con Antonio Fernández',
      scheduledDate: '2026-08-01',
      startTime: '11:00',
      endTime: '11:30',
      meetingLink: 'https://meet.google.com/abc-defg-hij',
    });
    expect(createTask).toHaveBeenCalledWith('workspace-a', 'user-1', {
      title: 'Llamada con Antonio Fernández',
      notes: 'Visita de mantenimiento',
      scheduledDate: '2026-08-01',
      startTime: '11:00',
      endTime: '11:30',
    });
  });

  it('persists a title/date-only appointment fine when the specialist omits start/end (no fixed time, no Meet link)', async () => {
    const createTask = vi.fn(async () => ({ meetingLink: null }));
    const ports = fakePorts({
      doc: agendaSpecialistDoc(),
      binding: binding(),
      agenda: { createTask },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? 'Se lo paso a Ana.\n<delegate agent="specialist-1">Anota revisar el inventario el jueves</delegate>'
          : 'Anotado.\n<agenda_task title="Revisar inventario" date="2026-08-06">Pendiente de contar existencias</agenda_task>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'Anota revisar el inventario el jueves', 'user-1', ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.delegation?.agendaTask).toEqual({
      title: 'Revisar inventario',
      scheduledDate: '2026-08-06',
      startTime: null,
      endTime: null,
      meetingLink: null,
    });
    expect(createTask).toHaveBeenCalledWith('workspace-a', 'user-1', {
      title: 'Revisar inventario',
      notes: 'Pendiente de contar existencias',
      scheduledDate: '2026-08-06',
      startTime: null,
      endTime: null,
    });
  });

  it('never writes to the Agenda when the specialist lacks schedule_call/create_task, even if it emits the tag', async () => {
    const doc = document({
      specialists: {
        ...document().specialists,
        'specialist-1': specialist('specialist-1', {
          enabled: true,
          name: 'Marco',
          allowedActions: ['read_contacts'], // no agenda permission
        }),
      },
    });
    const createTask = vi.fn(async () => ({ meetingLink: null }));
    const ports = fakePorts({
      doc,
      binding: binding(),
      agenda: { createTask },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? 'Se lo paso a Marco.\n<delegate agent="specialist-1">algo</delegate>'
          : 'Confirmada.\n<agenda_task title="Cosa" date="2026-08-01">notas</agenda_task>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'algo', 'user-1', ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.delegation?.agendaTask).toBeNull();
    expect(result.delegation?.text).toBe('Confirmada.'); // tag still stripped from what the user sees
    expect(createTask).not.toHaveBeenCalled();
  });

  it('does not treat an unconfirmed/incomplete reply as a real appointment', async () => {
    const createTask = vi.fn(async () => ({ meetingLink: null }));
    const ports = fakePorts({
      doc: agendaSpecialistDoc(),
      binding: binding(),
      agenda: { createTask },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? 'Se lo paso a Ana.\n<delegate agent="specialist-1">algo</delegate>'
          : '¿A qué hora te viene bien mañana?', // no tag at all — still gathering info
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'Agenda algo', 'user-1', ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.delegation?.agendaTask).toBeNull();
    expect(createTask).not.toHaveBeenCalled();
  });
});

// BLOQUEO 1 — Creador de Contenido. Igual que el bloque de Agenda de arriba:
// gated EXCLUSIVAMENTE en las allowedActions realmente persistidas del
// especialista objetivo (nunca en su templateId, nombre visible o lo que el
// modelo diga de sí mismo) — mismo patrón de "defensa en profundidad" que
// canManageAgenda/AGENDA_TASK_TAG.
describe('real chat service — Creador de Contenido (read_content/create_content_draft/update_content_draft)', () => {
  function contentSpecialistDoc(allowedActions: string[] = ['read_memory', 'create_task', 'request_handoff', 'read_content', 'create_content_draft', 'update_content_draft']) {
    return document({
      specialists: {
        ...document().specialists,
        'specialist-1': specialist('specialist-1', {
          enabled: true,
          name: 'Lucía',
          function: 'Creación de contenido',
          allowedActions: allowedActions as OfficeSpecialistConfiguration['allowedActions'],
        }),
      },
    });
  }

  it('really creates a content draft when the specialist has create_content_draft and emits the tag', async () => {
    const create = vi.fn(async () => ({
      kind: 'created' as const,
      contentItemId: 'content-1',
      title: 'Reel de automatizaciones',
      status: 'idea',
      version: 1,
      href: '/contenido/content-1?from=scripts',
    }));
    const ports = fakePorts({
      doc: contentSpecialistDoc(),
      binding: binding(),
      content: { search: vi.fn(async () => []), create, update: vi.fn(async () => ({ kind: 'error' as const, error: 'n/a' })) },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? 'Se lo paso a Lucía.\n<delegate agent="specialist-1">Guarda un guion sobre automatizaciones</delegate>'
          : 'Guion guardado.\n<content_draft>{"title":"Reel de automatizaciones","script_hook":"Hook fuerte"}</content_draft>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'Guarda un guion sobre automatizaciones', 'user-1', ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(create).toHaveBeenCalledWith('workspace-a', 'user-1', { title: 'Reel de automatizaciones', script_hook: 'Hook fuerte' });
    expect(result.delegation?.content).toEqual({
      kind: 'created',
      contentItemId: 'content-1',
      title: 'Reel de automatizaciones',
      status: 'idea',
      version: 1,
      href: '/contenido/content-1?from=scripts',
    });
    expect(result.delegation?.text).toBe('Guion guardado.'); // tag stripped from what the user sees
  });

  it('returns the exact /contenido/{id}?from=scripts link the port produced, never inventing one', async () => {
    const create = vi.fn(async () => ({
      kind: 'created' as const,
      contentItemId: 'abc-123',
      title: 'X',
      status: 'idea',
      version: 1,
      href: '/contenido/abc-123?from=scripts',
    }));
    const ports = fakePorts({
      doc: contentSpecialistDoc(),
      binding: binding(),
      content: { search: vi.fn(async () => []), create, update: vi.fn() as never },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? '<delegate agent="specialist-1">crea un guion</delegate>'
          : '<content_draft>{"title":"X"}</content_draft>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'crea un guion', 'user-1', ports);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.delegation?.content?.kind).toBe('created');
    if (result.delegation?.content?.kind === 'created') {
      expect(result.delegation.content.href).toBe('/contenido/abc-123?from=scripts');
    }
  });

  it('searches real content BEFORE generating the specialist reply, and injects the results into its own system prompt', async () => {
    const search = vi.fn(async () => [{ id: 'c-1', title: 'Guion de verano', status: 'idea', version: 3 }]);
    let sawCatalog = false;
    const ports = fakePorts({
      doc: contentSpecialistDoc(),
      binding: binding(),
      content: { search, create: vi.fn() as never, update: vi.fn() as never },
      reply: (systemPrompt) => {
        if (!systemPrompt.includes('Eres el Orquestador')) {
          sawCatalog = systemPrompt.includes('c-1') && systemPrompt.includes('Guion de verano') && systemPrompt.includes('expected_version="3"');
          return 'ok';
        }
        return '<delegate agent="specialist-1">actualiza el guion de verano</delegate>';
      },
    });

    await handleCoordinatorMessage('workspace-a', [], 'actualiza el guion de verano', 'user-1', ports);

    expect(search).toHaveBeenCalledWith('workspace-a', 'actualiza el guion de verano');
    expect(sawCatalog).toBe(true);
  });

  it('never searches content for a specialist without read_content, even if it can create/update drafts', async () => {
    const search = vi.fn(async () => []);
    const ports = fakePorts({
      doc: contentSpecialistDoc(['create_content_draft', 'update_content_draft']), // no read_content
      binding: binding(),
      content: { search, create: vi.fn() as never, update: vi.fn() as never },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador') ? '<delegate agent="specialist-1">algo</delegate>' : 'ok',
    });

    await handleCoordinatorMessage('workspace-a', [], 'algo', 'user-1', ports);
    expect(search).not.toHaveBeenCalled();
  });

  it("never calls content.create when the specialist's own allowedActions don't include create_content_draft — even though it emitted the tag (jailbreak attempt never trusted)", async () => {
    const create = vi.fn(async () => ({ kind: 'created' as const, contentItemId: 'x', title: 'x', status: 'idea', version: 1, href: '/x' }));
    const ports = fakePorts({
      doc: contentSpecialistDoc(['read_content']), // read only — no create_content_draft
      binding: binding(),
      content: { search: vi.fn(async () => []), create, update: vi.fn() as never },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? '<delegate agent="specialist-1">crea un guion de todos modos</delegate>'
          : 'Aquí tienes.\n<content_draft>{"title":"Intento no autorizado"}</content_draft>', // jailbroken model still emits the tag
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'crea un guion de todos modos', 'user-1', ports);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(create).not.toHaveBeenCalled();
    expect(result.delegation?.content).toBeNull();
    expect(result.delegation?.text).toBe('Aquí tienes.'); // tag still stripped from what the user sees, never surfaced raw
  });

  it('no other template can save content even if the coordinator delegates to it and it emits the exact same tag', async () => {
    // Same shape as the agenda "lacks schedule_call/create_task" test —
    // any specialist without create_content_draft in ITS OWN persisted
    // allowedActions is inert for this tag, regardless of visible name.
    const create = vi.fn();
    const ports = fakePorts({
      doc: document({
        specialists: {
          ...document().specialists,
          'specialist-1': specialist('specialist-1', { enabled: true, name: 'Marco', function: 'Ventas', allowedActions: ['read_contacts', 'draft_message'] }),
        },
      }),
      binding: binding(),
      content: { search: vi.fn(async () => []), create, update: vi.fn() as never },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? '<delegate agent="specialist-1">algo</delegate>'
          : 'listo.\n<content_draft>{"title":"No debería guardarse"}</content_draft>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'algo', 'user-1', ports);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(create).not.toHaveBeenCalled();
    expect(result.delegation?.content).toBeNull();
  });

  it('a draft (unpublished) or disabled specialist never runs at all — coordinator answers directly instead', async () => {
    const create = vi.fn();
    const doc = contentSpecialistDoc();
    doc.status = 'draft'; // whole configuration unpublished
    const ports = fakePorts({
      doc,
      binding: binding(),
      content: { search: vi.fn(async () => []), create, update: vi.fn() as never },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? 'Se lo paso a Lucía.\n<delegate agent="specialist-1">crea un guion</delegate>'
          : 'no debería llamarse nunca',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'crea un guion', 'user-1', ports);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.delegation).toBeNull(); // never resolved as an active specialist
    expect(create).not.toHaveBeenCalled();
  });

  it('really updates a content item and reports the resulting version when the specialist has update_content_draft', async () => {
    const update = vi.fn(async () => ({ kind: 'updated' as const, contentItemId: '11111111-1111-4111-8111-111111111111', version: 4 }));
    const ports = fakePorts({
      doc: contentSpecialistDoc(),
      binding: binding(),
      content: { search: vi.fn(async () => [{ id: '11111111-1111-4111-8111-111111111111', title: 'Guion X', status: 'idea', version: 3 }]), create: vi.fn() as never, update },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? '<delegate agent="specialist-1">rellena el hook del guion X</delegate>'
          : 'Actualizado.\n<content_update content_item_id="11111111-1111-4111-8111-111111111111" expected_version="3">{"script_hook":"Nuevo hook"}</content_update>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'rellena el hook del guion X', 'user-1', ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(update).toHaveBeenCalledWith('workspace-a', 'user-1', '11111111-1111-4111-8111-111111111111', 3, { script_hook: 'Nuevo hook' });
    expect(result.delegation?.content).toEqual({ kind: 'updated', contentItemId: '11111111-1111-4111-8111-111111111111', version: 4 });
  });

  it('surfaces a requires_confirmation outcome from the port untouched — never writes on its own, never claims it saved', async () => {
    const update = vi.fn(async () => ({
      kind: 'requires_confirmation' as const,
      token: 'tok123',
      expiresInSeconds: 300,
      summary: 'Vas a sustituir el hook de «Guion X».',
    }));
    const ports = fakePorts({
      doc: contentSpecialistDoc(),
      binding: binding(),
      content: { search: vi.fn(async () => [{ id: '11111111-1111-4111-8111-111111111111', title: 'Guion X', status: 'idea', version: 3 }]), create: vi.fn() as never, update },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? '<delegate agent="specialist-1">sustituye el hook</delegate>'
          : 'Voy a sustituirlo.\n<content_update content_item_id="11111111-1111-4111-8111-111111111111" expected_version="3">{"script_hook":"Otro"}</content_update>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'sustituye el hook', 'user-1', ports);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.delegation?.content).toEqual({
      kind: 'requires_confirmation',
      token: 'tok123',
      expiresInSeconds: 300,
      summary: 'Vas a sustituir el hook de «Guion X».',
    });
  });

  it('a CAS conflict from the port (content changed since it was read) is surfaced as an error, never silently retried or ignored', async () => {
    const update = vi.fn(async () => ({ kind: 'error' as const, error: 'Ese contenido cambió desde la última vez que lo leíste.' }));
    const ports = fakePorts({
      doc: contentSpecialistDoc(),
      binding: binding(),
      content: { search: vi.fn(async () => [{ id: '11111111-1111-4111-8111-111111111111', title: 'Guion X', status: 'idea', version: 3 }]), create: vi.fn() as never, update },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? '<delegate agent="specialist-1">actualiza</delegate>'
          : 'listo.\n<content_update content_item_id="11111111-1111-4111-8111-111111111111" expected_version="3">{"script_hook":"x"}</content_update>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'actualiza', 'user-1', ports);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.delegation?.content).toEqual({ kind: 'error', error: 'Ese contenido cambió desde la última vez que lo leíste.' });
  });

  it('malformed JSON inside the tag is treated as no action at all — never crashes the request', async () => {
    const create = vi.fn();
    const ports = fakePorts({
      doc: contentSpecialistDoc(),
      binding: binding(),
      content: { search: vi.fn(async () => []), create, update: vi.fn() as never },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? '<delegate agent="specialist-1">crea un guion</delegate>'
          : 'listo.\n<content_draft>{title esto no es json valido</content_draft>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'crea un guion', 'user-1', ports);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(create).not.toHaveBeenCalled();
    expect(result.delegation?.content).toBeNull();
  });

  it('never writes content when actorUserId is null, even for a fully-authorized specialist', async () => {
    const create = vi.fn();
    const ports = fakePorts({
      doc: contentSpecialistDoc(),
      binding: binding(),
      content: { search: vi.fn(async () => []), create, update: vi.fn() as never },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? '<delegate agent="specialist-1">crea un guion</delegate>'
          : '<content_draft>{"title":"x"}</content_draft>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'crea un guion', null, ports);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(create).not.toHaveBeenCalled();
    expect(result.delegation?.content).toBeNull();
  });

  it('ignores a content_draft/content_update tag emitted by a specialist OTHER than the one delegated to (never matches by name/text alone)', async () => {
    // The coordinator can only ever delegate to ONE agentId per turn — a tag
    // is only ever evaluated against THAT resolved targetConfig, never
    // against some other specialist's allowedActions found by scanning text.
    const create = vi.fn();
    const doc = document({
      specialists: {
        ...document().specialists,
        'specialist-1': specialist('specialist-1', { enabled: true, name: 'Marco', allowedActions: ['read_contacts'] }), // delegated to, no content actions
        'specialist-2': specialist('specialist-2', {
          enabled: true,
          name: 'Lucía',
          allowedActions: ['read_content', 'create_content_draft'], // has the actions, but NOT delegated to this turn
        }),
      },
    });
    const ports = fakePorts({
      doc,
      binding: binding(),
      content: { search: vi.fn(async () => []), create, update: vi.fn() as never },
      reply: (systemPrompt) =>
        systemPrompt.includes('Eres el Orquestador')
          ? '<delegate agent="specialist-1">algo</delegate>' // delegates to Marco, not Lucía
          : 'listo.\n<content_draft>{"title":"No debería guardarse"}</content_draft>',
    });

    const result = await handleCoordinatorMessage('workspace-a', [], 'algo', 'user-1', ports);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(create).not.toHaveBeenCalled();
    expect(result.delegation?.content).toBeNull();
  });
});
