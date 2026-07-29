import type { OrchestratorCommand } from './types';

const ACTOR = { actorId: 'demo-admin', role: 'workspace_admin' as const, workspaceId: 'workspace-demo' };

/**
 * Reflects today's real state, nothing invented: Hermes only exists on
 * Telegram right now, no HTTP bridge is confirmed, so `hermes_telegram` is
 * selected as the intended mode but stays `not_configured` — no endpoint,
 * no bot id, no secret. OpenRouter is left untouched (never tried yet).
 */
export function createOrchestratorFixtures(workspaceId = 'workspace-demo'): OrchestratorCommand[] {
  const actor = { ...ACTOR, workspaceId };
  return [
    {
      type: 'orchestrator.mode_selected',
      commandId: 'orchestrator-fixture-mode',
      workspaceId,
      actor,
      occurredAt: '2026-07-16T09:00:00.000Z',
      expectedRevision: 1,
      mode: 'hermes_telegram',
    },
  ];
}
