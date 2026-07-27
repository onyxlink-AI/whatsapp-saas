import { useEffect, useRef, useState } from 'react';
import {
  applyOpenRouterConnectionReport,
  createOpenRouterConnectionState,
  handleOpenRouterConnectionRequest,
  restoreOpenRouterConnectionState,
} from '../central-orchestration';
import type {
  OpenRouterConnectionBackendAction,
  OpenRouterConnectionBinding,
  OpenRouterConnectionKind,
  OpenRouterConnectionRequest,
  OpenRouterConnectionState,
} from '../central-orchestration';
import type { OrchestratorActorRole } from '../central-orchestrator';
import { UNCONFIGURED_OPENROUTER_CONNECTION_ADAPTER, type OpenRouterConnectionAdapter } from '../lib/openRouterConnectionAdapter';

// Browser-side mirror of the pure connection state. The injected adapter is
// the only transport boundary. On an ambiguous transport failure the request
// stays pending: the backend may have completed it even if the response was
// lost. Retrying therefore reuses the exact same requestId.

type PendingDelivery = {
  requestId: string;
  action: OpenRouterConnectionBackendAction;
  connectionKind: OpenRouterConnectionKind;
};

export type OpenRouterConnectionFeed = {
  binding: OpenRouterConnectionBinding;
  /** True while the initial snapshot is being fetched from the backend. */
  loading: boolean;
  /** Local validation rejection from the pure reducer. */
  error: string | null;
  sending: boolean;
  /** Transport or report-validation failure; the operation remains pending. */
  adapterError: string | null;
  retryDelivery: () => void;
  connect: (connectionKind: OpenRouterConnectionKind) => void;
  verify: () => void;
  revoke: () => void;
};

export function useOpenRouterConnectionFeed(
  actorEmail: string,
  role: OrchestratorActorRole,
  workspaceId: string,
  adapter: OpenRouterConnectionAdapter = UNCONFIGURED_OPENROUTER_CONNECTION_ADAPTER,
): OpenRouterConnectionFeed {
  const [connection, setConnection] = useState<OpenRouterConnectionState>(() => createOpenRouterConnectionState(workspaceId));
  const connectionRef = useRef(connection);
  const pendingDeliveryRef = useRef<PendingDelivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [adapterError, setAdapterError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(adapter.load));
  const actor = { actorId: actorEmail, role, workspaceId };
  const systemActor = { actorId: 'openrouter-connection-adapter', role: 'system' as const, workspaceId };

  const commitConnection = (next: OpenRouterConnectionState) => {
    connectionRef.current = next;
    setConnection(next);
  };

  // Hydrate from the backend's persisted binding on mount. OfficeVirtualApp
  // remounts this hook via key={workspaceId} on workspace switch, so a plain
  // mount-only effect never needs to react to workspaceId changing mid-life.
  useEffect(() => {
    if (!adapter.load) return;
    let cancelled = false;
    adapter.load(workspaceId).then((result) => {
      if (cancelled) return;
      if (result.status === 'error') {
        setAdapterError(result.message);
        setLoading(false);
        return;
      }
      const restored = restoreOpenRouterConnectionState(workspaceId, result.snapshot.binding);
      if (restored) commitConnection(restored);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const deliver = (delivery: PendingDelivery) => {
    setSending(true);
    setAdapterError(null);
    adapter
      .send({ requestId: delivery.requestId, workspaceId, connectionKind: delivery.connectionKind, action: delivery.action })
      .then((result) => {
        setSending(false);
        if (result.status === 'error') {
          setAdapterError(result.message);
          return;
        }

        const current = connectionRef.current;
        if (current.binding.pendingRequestId !== delivery.requestId) return;
        const applied = applyOpenRouterConnectionReport(current, systemActor, result.report);
        if (applied.status === 'rejected') {
          setAdapterError(applied.code);
          return;
        }

        pendingDeliveryRef.current = null;
        commitConnection(applied.state);
      })
      .catch((reason: unknown) => {
        setSending(false);
        setAdapterError(reason instanceof Error ? reason.message : 'Fallo inesperado al contactar con el backend.');
      });
  };

  const dispatch = (request: OpenRouterConnectionRequest) => {
    if (loading || pendingDeliveryRef.current) {
      setError('operation_in_progress');
      return;
    }

    const result = handleOpenRouterConnectionRequest(connectionRef.current, actor, request);
    if (result.status === 'rejected') {
      setError(result.code);
      return;
    }
    setError(null);
    commitConnection(result.state);
    if (result.status === 'accepted') {
      const connectionKind = result.state.binding.connectionKind ?? (
        result.backendAction.type === 'provision_connection' ? result.backendAction.connectionKind : 'dedicated'
      );
      const delivery = { requestId: request.requestId, action: result.backendAction, connectionKind };
      pendingDeliveryRef.current = delivery;
      deliver(delivery);
    }
  };

  const retryDelivery = () => {
    const delivery = pendingDeliveryRef.current;
    if (!delivery || sending) return;
    deliver(delivery);
  };

  const connect = (connectionKind: OpenRouterConnectionKind) =>
    dispatch({
      requestId: crypto.randomUUID(),
      workspaceId,
      action: 'connect',
      connectionKind,
      occurredAt: new Date().toISOString(),
    });

  const verify = () =>
    dispatch({ requestId: crypto.randomUUID(), workspaceId, action: 'verify', occurredAt: new Date().toISOString() });

  const revoke = () =>
    dispatch({ requestId: crypto.randomUUID(), workspaceId, action: 'revoke', occurredAt: new Date().toISOString() });

  return { binding: connection.binding, loading, error, sending, adapterError, retryDelivery, connect, verify, revoke };
}
