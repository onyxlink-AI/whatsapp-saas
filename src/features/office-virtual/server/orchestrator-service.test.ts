// Proof that the Orquestador's "Modelos de especialistas" screen no longer
// starts permanently blank: loadOrchestratorBinding must reflect the REAL
// OpenRouter signal (never a client-only default), and a persisted command
// must survive a fresh load exactly like a page reload would.

import { describe, expect, it } from 'vitest';
import {
  handleOrchestratorCommand,
  loadOrchestratorBinding,
  type OrchestratorServicePorts,
  type OrchestratorStore,
} from './orchestrator-service';
import type { WorkspaceOrchestratorBinding, OrchestratorActor } from '../client/central-orchestrator';
import type { OpenRouterStatus } from '../client/central-integrations/real-integrations';

const SUPER_ADMIN: OrchestratorActor = { actorId: 'admin@onyxlink.test', role: 'super_admin', workspaceId: 'workspace-a' };

function fakeStore() {
  const bindings = new Map<string, WorkspaceOrchestratorBinding>();
  const store: OrchestratorStore = {
    async loadBinding(workspaceId) {
      return bindings.get(workspaceId) ?? null;
    },
    async saveBinding(workspaceId, binding) {
      bindings.set(workspaceId, binding);
    },
  };
  return { store, bindings };
}

function ports(store: OrchestratorStore, real: OpenRouterStatus = 'not_configured'): OrchestratorServicePorts {
  return { store, resolveRealOpenRouterStatus: async () => real, now: () => '2026-07-30T12:00:00.000Z' };
}

describe('orchestrator service — real OpenRouter signal overlay', () => {
  it('never a client-only default: a fresh workspace with no persisted policy still reports the real signal', async () => {
    const { store } = fakeStore();

    const blocked = await loadOrchestratorBinding('workspace-a', ports(store, 'needs_attention'));
    expect(blocked.openrouter.hasApiKey).toBe(false);
    expect(blocked.openrouter.status).toBe('error');
    expect(blocked.openrouter.statusDetail).toMatch(/API key/);

    const ready = await loadOrchestratorBinding('workspace-a', ports(store, 'configured'));
    expect(ready.openrouter.hasApiKey).toBe(true);
    expect(ready.openrouter.status).toBe('connected');
  });

  it('"verified" activates exactly like "configured" — the Orquestador treats both as connected', async () => {
    const { store } = fakeStore();
    const binding = await loadOrchestratorBinding('workspace-a', ports(store, 'verified'));
    expect(binding.openrouter.hasApiKey).toBe(true);
    expect(binding.openrouter.status).toBe('connected');
  });

  it('never overwrites the persisted signal: hasApiKey/status are always live-recomputed, never trusted from storage', async () => {
    const { store, bindings } = fakeStore();
    // Simulate a stale persisted row claiming "connected" from a previous session.
    const stale = (await loadOrchestratorBinding('workspace-a', ports(store, 'configured')));
    bindings.set('workspace-a', { ...stale, openrouter: { ...stale.openrouter, hasApiKey: true, status: 'connected' } });

    const reloaded = await loadOrchestratorBinding('workspace-a', ports(store, 'not_configured'));
    expect(reloaded.openrouter.hasApiKey).toBe(false);
    expect(reloaded.openrouter.status).toBe('not_configured');
  });
});

describe('orchestrator service — save and reload', () => {
  it('persists a model policy command and a fresh load reflects it, exactly like a page reload would', async () => {
    const { store } = fakeStore();

    const result = await handleOrchestratorCommand(
      'workspace-a',
      SUPER_ADMIN,
      'user-1',
      {
        commandId: 'cmd-1',
        expectedRevision: 1,
        type: 'orchestrator.openrouter_model_policy_updated',
        model: 'anthropic/claude-sonnet-4.6',
        costProfile: 'balanced',
      },
      ports(store, 'configured'),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.binding.openrouter.model).toBe('anthropic/claude-sonnet-4.6');
    expect(result.binding.openrouter.hasApiKey).toBe(true);
    expect(result.binding.revision).toBe(2);

    const reloaded = await loadOrchestratorBinding('workspace-a', ports(store, 'configured'));
    expect(reloaded.openrouter.model).toBe('anthropic/claude-sonnet-4.6');
    expect(reloaded.revision).toBe(2);
  });

  it('rejects a stale revision instead of silently overwriting a concurrent edit', async () => {
    const { store } = fakeStore();
    await handleOrchestratorCommand(
      'workspace-a',
      SUPER_ADMIN,
      'user-1',
      { commandId: 'cmd-1', expectedRevision: 1, type: 'orchestrator.openrouter_config_updated', model: 'openai/gpt-4.1-mini' },
      ports(store),
    );

    const result = await handleOrchestratorCommand(
      'workspace-a',
      SUPER_ADMIN,
      'user-1',
      { commandId: 'cmd-2', expectedRevision: 1, type: 'orchestrator.openrouter_config_updated', model: 'anthropic/claude-3.5-haiku' },
      ports(store),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('stale_revision');
  });

  it('persists a per-agent model override and keeps the workspace default untouched', async () => {
    const { store } = fakeStore();
    await handleOrchestratorCommand(
      'workspace-a',
      SUPER_ADMIN,
      'user-1',
      { commandId: 'cmd-1', expectedRevision: 1, type: 'orchestrator.openrouter_model_policy_updated', model: 'openai/gpt-4.1-mini' },
      ports(store),
    );

    const result = await handleOrchestratorCommand(
      'workspace-a',
      SUPER_ADMIN,
      'user-1',
      {
        commandId: 'cmd-2',
        expectedRevision: 2,
        type: 'orchestrator.openrouter_agent_override_updated',
        agentId: 'review-qa',
        override: { model: 'anthropic/claude-3.7-sonnet', costProfile: 'premium' },
      },
      ports(store),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.binding.openrouter.agentOverrides['review-qa']?.model).toBe('anthropic/claude-3.7-sonnet');
    expect(result.binding.openrouter.model).toBe('openai/gpt-4.1-mini');
  });
});
