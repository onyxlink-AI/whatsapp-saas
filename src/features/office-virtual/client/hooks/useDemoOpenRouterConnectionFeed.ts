import { useState } from 'react';
import type { OpenRouterConnectionKind } from '../central-orchestration';
import { createDemoOpenRouterBinding } from '../demo/demoPresentationData';
import type { OpenRouterConnectionFeed } from './useOpenRouterConnectionFeed';

/** Local-only connection controls for the showroom; no adapter or API call exists here. */
export function useDemoOpenRouterConnectionFeed(
  workspaceId: string,
  enabled: boolean,
): OpenRouterConnectionFeed {
  const [binding, setBinding] = useState(() => createDemoOpenRouterBinding(enabled ? workspaceId : `disabled-${workspaceId}`));

  const connect = (connectionKind: OpenRouterConnectionKind) => {
    setBinding({
      ...createDemoOpenRouterBinding(workspaceId),
      connectionKind,
      updatedAt: new Date().toISOString(),
      updatedBy: 'demo@onyxlinkpanel.com',
    });
  };
  const verify = () => setBinding((previous) => ({
    ...previous,
    status: 'connected',
    statusDetail: 'Conexión de muestra verificada.',
    updatedAt: new Date().toISOString(),
  }));
  const revoke = () => setBinding((previous) => ({
    ...previous,
    status: 'revoked',
    hasCredential: false,
    statusDetail: 'Conexión de muestra pausada.',
    updatedAt: new Date().toISOString(),
  }));

  return {
    binding,
    loading: false,
    error: null,
    sending: false,
    adapterError: null,
    retryDelivery: () => {},
    connect,
    verify,
    revoke,
  };
}
