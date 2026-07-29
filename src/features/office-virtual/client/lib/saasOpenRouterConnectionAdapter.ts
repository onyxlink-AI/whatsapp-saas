import type {
  OpenRouterConnectionAdapter,
  OpenRouterConnectionAdapterRequest,
  OpenRouterConnectionAdapterSnapshot,
} from './openRouterConnectionAdapter';
import type { OpenRouterConnectionReport } from '../central-orchestration';

type SnapshotResponse = { binding: OpenRouterConnectionAdapterSnapshot['binding']; model?: string | null };

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** Browser transport for the SaaS-owned OpenRouter integration. It only
 * sends workspace/action metadata and receives sanitized connection state. */
export function createSaasOpenRouterConnectionAdapter(): OpenRouterConnectionAdapter {
  return {
    async load(workspaceId) {
      try {
        const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual/openrouter-connection`);
        if (!response.ok) return { status: 'error', message: await readError(response) };
        const body = (await response.json()) as SnapshotResponse;
        return {
          status: 'ok',
          snapshot: { binding: body.binding, model: body.model ?? null },
        };
      } catch {
        return { status: 'error', message: 'No se pudo leer la conexión OpenRouter del workspace.' };
      }
    },

    async send(request: OpenRouterConnectionAdapterRequest) {
      try {
        const response = await fetch(`/api/workspace/${encodeURIComponent(request.workspaceId)}/office-virtual/openrouter-connection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: request.requestId,
            workspaceId: request.workspaceId,
            action: request.action,
          }),
        });
        if (!response.ok) return { status: 'error', message: await readError(response) };
        const body = (await response.json()) as { report?: unknown };
        if (!body.report) return { status: 'error', message: 'El backend no devolvió un informe de conexión.' };
        return { status: 'ok', report: body.report as OpenRouterConnectionReport };
      } catch {
        return { status: 'error', message: 'No se pudo contactar con el backend de conexión OpenRouter.' };
      }
    },
  };
}
