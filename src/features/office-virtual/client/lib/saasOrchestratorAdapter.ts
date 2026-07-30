import type { WorkspaceOrchestratorBinding } from '../central-orchestrator';
import type { OrchestratorAdapter, OrchestratorAdapterCommand } from './orchestratorAdapter';

type BindingResponse = { binding: WorkspaceOrchestratorBinding };

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** Browser transport for the SaaS-owned Orquestador model policy. */
export function createSaasOrchestratorAdapter(): OrchestratorAdapter {
  return {
    async load(workspaceId) {
      try {
        const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual/orchestrator`);
        if (!response.ok) return { status: 'error', message: await readError(response) };
        const body = (await response.json()) as BindingResponse;
        return { status: 'ok', binding: body.binding };
      } catch {
        return { status: 'error', message: 'No se pudo leer la política del Orquestador.' };
      }
    },

    async send(workspaceId, expectedRevision, command: OrchestratorAdapterCommand) {
      try {
        const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual/orchestrator`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision, command }),
        });
        if (!response.ok) return { status: 'error', message: await readError(response) };
        const body = (await response.json()) as BindingResponse;
        return { status: 'ok', binding: body.binding };
      } catch {
        return { status: 'error', message: 'No se pudo contactar con el backend del Orquestador.' };
      }
    },
  };
}
