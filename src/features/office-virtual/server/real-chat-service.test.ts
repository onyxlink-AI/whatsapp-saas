// Proof that talking to the Orquestador is a real, model-backed flow: it
// refuses to run without a real API key/model, it only ever delegates to a
// specialist that is genuinely enabled+published, and a hallucinated agent
// id degrades to "coordinator answered directly" instead of crashing.

import { describe, expect, it, vi } from 'vitest';
import { handleCoordinatorMessage, type RealChatServicePorts } from './real-chat-service';
import type { OfficeConfigurationHead, OfficeConfigurationStore } from './office-configuration-service';
import type { OrchestratorStore } from './orchestrator-service';
import type { OfficeConfigurationDocument, OfficeSpecialistConfiguration } from '../client/central-integrations/configuration';
import type { WorkspaceOrchestratorBinding } from '../client/central-orchestrator';
import { CONFIGURABLE_AGENT_IDS, DEFAULT_SPECIALIST_COLORS, type ConfigurableOfficeAgentId } from '../client/central-integrations/specialist-seats';

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
  };
}

function binding(overrides: Partial<WorkspaceOrchestratorBinding['openrouter']> = {}): WorkspaceOrchestratorBinding {
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

    const result = await handleCoordinatorMessage('workspace-a', [], 'hola', ports);

    expect(result).toEqual({ success: false, code: 'api_key_missing' });
    expect(generateReply).not.toHaveBeenCalled();
  });

  it('refuses to run when no model is configured', async () => {
    const ports = fakePorts({ doc: document(), binding: binding({ model: null, fallbackModel: null }), reply: () => '' });
    const result = await handleCoordinatorMessage('workspace-a', [], 'hola', ports);
    expect(result).toEqual({ success: false, code: 'model_missing' });
  });

  it('falls back to fallbackModel when the primary model is unset', async () => {
    const ports = fakePorts({
      doc: document(),
      binding: binding({ model: null, fallbackModel: 'openai/gpt-4.1-mini' }),
      reply: () => 'Respuesta directa, sin delegar.',
    });
    const result = await handleCoordinatorMessage('workspace-a', [], 'hola', ports);
    expect(result.success).toBe(true);
  });
});

describe('real chat service — delegation', () => {
  it('answers directly when no specialist is published (never hallucinates one to delegate to)', async () => {
    const doc = document(); // all specialists disabled/unpublished by default
    const ports = fakePorts({ doc, binding: binding(), reply: () => 'Puedo ayudarte yo mismo con eso.' });

    const result = await handleCoordinatorMessage('workspace-a', [], 'Necesito un resumen', ports);

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

    const result = await handleCoordinatorMessage('workspace-a', [], 'Necesito una propuesta', ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.coordinatorText).toBe('Se lo paso a Marco.');
    expect(result.delegation).toEqual({
      agentId: 'specialist-1',
      specialistName: 'Marco',
      text: 'Aquí tienes la propuesta redactada para el cliente X.',
    });
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

    const result = await handleCoordinatorMessage('workspace-a', [], 'algo', ports);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.delegation).toBeNull();
    expect(result.coordinatorText).toBe('Se lo paso a alguien.');
    expect(generateReply).toHaveBeenCalledTimes(1); // never made the second (specialist) call
  });
});
