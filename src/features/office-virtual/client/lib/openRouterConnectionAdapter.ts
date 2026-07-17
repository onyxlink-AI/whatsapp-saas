import type {
  OpenRouterConnectionBackendAction,
  OpenRouterConnectionReport,
} from '../central-orchestration';

// The seam between this app and the real OpenRouter connection backend that
// will live in WhatsApp-saas. There is no confirmed HTTP route yet (see
// COORDINACION_CLAUDE_CODEX.md), so this file defines the contract a real
// client will implement later — it never calls fetch, never guesses a URL,
// never touches a credential, and never talks to OpenRouter directly. The
// browser only ever sees what's defined below: an action to send and a
// non-secret outcome to apply. Everything that could hold a real secret
// (the OpenRouter API key itself) stays server-side by construction — this
// contract has no field for it.

export type OpenRouterConnectionAdapterRequest = {
  requestId: string;
  workspaceId: string;
  action: OpenRouterConnectionBackendAction;
};

/** Complete sanitized report. Correlation metadata is backend-issued too. */
export type OpenRouterConnectionAdapterReport = OpenRouterConnectionReport;

export type OpenRouterConnectionAdapterResult =
  | { status: 'ok'; report: OpenRouterConnectionAdapterReport }
  | { status: 'error'; message: string };

export type OpenRouterConnectionAdapter = {
  send(request: OpenRouterConnectionAdapterRequest): Promise<OpenRouterConnectionAdapterResult>;
};

/**
 * Default adapter while no backend route is confirmed. It resolves
 * immediately with an honest error instead of hanging or fabricating a
 * "connected" report — swap this for a real HTTP-backed adapter once the
 * WhatsApp-saas route exists, without changing anything else in the feed.
 */
export const UNCONFIGURED_OPENROUTER_CONNECTION_ADAPTER: OpenRouterConnectionAdapter = {
  async send() {
    return {
      status: 'error',
      message: 'El backend de conexión de OpenRouter todavía no tiene una ruta desplegada.',
    };
  },
};
