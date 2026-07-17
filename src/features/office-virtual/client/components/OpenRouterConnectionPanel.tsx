import { useState } from 'react';
import type { OpenRouterConnectionKind } from '../central-orchestration';
import type { OpenRouterConnectionFeed } from '../hooks/useOpenRouterConnectionFeed';
import {
  OPENROUTER_CONNECTION_ERROR_LABEL_ES,
  OPENROUTER_CONNECTION_KIND_DESCRIPTION_ES,
  OPENROUTER_CONNECTION_KIND_LABEL_ES,
  OPENROUTER_CONNECTION_STATUS_LABEL_ES,
  OPENROUTER_CONNECTION_STATUS_TW,
} from '../lib/orchestratorStyles';

// Presentational only, built against Codex's src/central-orchestration/openrouter-connection.ts
// via src/hooks/useOpenRouterConnectionFeed.ts (mine — I never touch the
// central-orchestration file itself). There is no real backend behind this
// yet: "Conectar"/"Verificar"/"Revocar" only record a local request and the
// connection honestly stays "Pendiente del backend" until a real `system`
// actor reports back — nothing here is faked into "Conectado". No input on
// this screen can ever hold an API key, token or connectionId: the admin
// only ever picks compartida/dedicada; the connectionId is backend-issued
// and shown read-only because the contract marks it non-secret, and
// hasCredential is a presence indicator only, never a value.

const CONNECTION_KINDS: OpenRouterConnectionKind[] = ['shared', 'dedicated'];
const PENDING_ACTION_LABEL_ES = {
  connect: 'conectar',
  verify: 'verificar',
  revoke: 'revocar',
} as const;

type Props = { feed: OpenRouterConnectionFeed };

function CredentialIndicator({ has }: { has: boolean }) {
  return (
    <div className="text-[11px] text-white/40 flex flex-wrap items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${has ? 'bg-emerald-400' : 'bg-white/20'}`} />
      Credencial en backend: {has ? 'presente' : 'sin configurar'}
      <span className="text-white/25">— nunca se lee ni se escribe desde esta pantalla.</span>
    </div>
  );
}

function KindOption({
  kind,
  selected,
  disabled,
  onSelect,
}: {
  kind: OpenRouterConnectionKind;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`text-left rounded-md border p-3 flex-1 transition-colors disabled:opacity-50 disabled:pointer-events-none ${
        selected ? 'border-violet-400/40 bg-violet-500/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      <div className="text-xs text-white/85 font-medium">{OPENROUTER_CONNECTION_KIND_LABEL_ES[kind]}</div>
      <p className="text-[10px] text-white/40 mt-1 leading-relaxed">{OPENROUTER_CONNECTION_KIND_DESCRIPTION_ES[kind]}</p>
    </button>
  );
}

export default function OpenRouterConnectionPanel({ feed }: Props) {
  const { binding } = feed;
  const [kindDraft, setKindDraft] = useState<OpenRouterConnectionKind>(binding.connectionKind ?? 'shared');

  const busy = binding.pendingAction !== null;
  const pendingActionLabel = binding.pendingAction ? PENDING_ACTION_LABEL_ES[binding.pendingAction] : null;
  const canConnect = !busy && binding.status !== 'connected';
  const canManageExisting = !busy && binding.status === 'connected';

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Conexión de OpenRouter</div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${OPENROUTER_CONNECTION_STATUS_TW[binding.status]}`}>
          {OPENROUTER_CONNECTION_STATUS_LABEL_ES[binding.status]}
        </span>
      </div>
      <p className="text-[11px] text-white/35 mb-3 leading-relaxed">
        Elige cómo se conecta este workspace a OpenRouter. Conectar, verificar y revocar solo registran una solicitud — el backend es
        quien aprovisiona la conexión real y reporta el resultado; esta pantalla nunca pide ni muestra una API key.
      </p>

      {feed.error && (
        <div className="rounded-md border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-200/85 mb-3">
          {OPENROUTER_CONNECTION_ERROR_LABEL_ES[feed.error as keyof typeof OPENROUTER_CONNECTION_ERROR_LABEL_ES] ?? feed.error}
        </div>
      )}
      {feed.adapterError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-200/85 mb-3">
          <span>No se pudo confirmar la operación con el backend: {feed.adapterError}</span>
          {busy && !feed.sending && (
            <button
              type="button"
              onClick={feed.retryDelivery}
              className="onyx-control px-2.5 py-1 text-[11px] font-medium text-white/80"
            >
              Reintentar envío
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        {CONNECTION_KINDS.map((kind) => (
          <KindOption
            key={kind}
            kind={kind}
            selected={(binding.connectionKind ?? kindDraft) === kind}
            disabled={!canConnect}
            onSelect={() => setKindDraft(kind)}
          />
        ))}
      </div>

      <div className="rounded-md border border-white/[0.05] bg-black/20 p-3 mt-3 space-y-2">
        <div className="text-[11px] text-white/40 flex items-start gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${binding.connectionId ? 'bg-emerald-400' : 'bg-white/20'}`} />
          Identificador de conexión:{' '}
          <span className={`min-w-0 break-all ${binding.connectionId ? 'text-white/65' : ''}`}>
            {binding.connectionId ?? 'aún no aprovisionado'}
          </span>
        </div>
        <CredentialIndicator has={binding.hasCredential} />
        {binding.statusDetail && (
          <p className={`text-[11px] ${binding.status === 'error' ? 'text-rose-300/75' : 'text-white/40'}`}>{binding.statusDetail}</p>
        )}
        {pendingActionLabel && (
          <p className="text-[11px] text-amber-300/70">
            {feed.sending
              ? `Enviando solicitud de ${pendingActionLabel} al backend...`
              : `Esperando confirmación del backend para ${pendingActionLabel}...`}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
        {canConnect && (
          <button
            onClick={() => feed.connect(kindDraft)}
            className="onyx-control text-[11px] font-medium text-white/80 px-3 py-1.5 transition-colors"
          >
            Conectar
          </button>
        )}
        {canManageExisting && (
          <>
            <button
              onClick={() => feed.verify()}
              className="onyx-control text-[11px] font-medium text-white/80 px-3 py-1.5 transition-colors"
            >
              Verificar
            </button>
            <button
              onClick={() => feed.revoke()}
              className="text-[11px] font-medium text-white/45 hover:text-rose-300 px-2 py-1.5 transition-colors"
            >
              Revocar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
