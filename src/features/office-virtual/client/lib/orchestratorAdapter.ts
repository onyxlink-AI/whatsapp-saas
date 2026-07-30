import type { OrchestratorCommand, WorkspaceOrchestratorBinding } from '../central-orchestrator';

// The seam between useOrchestratorFeed.ts and the real backend route
// (src/app/api/workspace/[id]/office-virtual/orchestrator/route.ts). Mirrors
// openRouterConnectionAdapter.ts's shape: the browser never sees a
// credential, only the sanitized binding the backend already overlays with
// the live OpenRouter signal (see orchestrator-service.ts).

/** What the client actually sends — the reducer-shape command, minus the fields the server derives itself (actor, occurredAt, commandId, workspaceId). */
export type OrchestratorAdapterCommand = Omit<
  OrchestratorCommand,
  'commandId' | 'workspaceId' | 'actor' | 'occurredAt' | 'expectedRevision'
>;

export type OrchestratorAdapterResult =
  | { status: 'ok'; binding: WorkspaceOrchestratorBinding }
  | { status: 'error'; message: string };

export type OrchestratorAdapter = {
  load(workspaceId: string): Promise<OrchestratorAdapterResult>;
  send(
    workspaceId: string,
    expectedRevision: number,
    command: OrchestratorAdapterCommand,
  ): Promise<OrchestratorAdapterResult>;
};

/** Default adapter for demo mode / disabled callers — never guesses a fetch, never fabricates a binding. */
export const UNCONFIGURED_ORCHESTRATOR_ADAPTER: OrchestratorAdapter = {
  async load() {
    return { status: 'error', message: 'El backend del Orquestador todavía no está disponible.' };
  },
  async send() {
    return { status: 'error', message: 'El backend del Orquestador todavía no está disponible.' };
  },
};
