import { useState } from 'react';
import { MessageCircle, Mic, Plug, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  HermesTelegramConfig,
  OrchestratorMode,
  OrchestratorMutationErrorCode,
} from '../central-orchestrator';
import type { OrchestratorFeed } from '../hooks/useOrchestratorFeed';
import type { OpenRouterConnectionFeed } from '../hooks/useOpenRouterConnectionFeed';
import {
  ORCHESTRATOR_ERROR_LABEL_ES,
  ORCHESTRATOR_MODE_DESCRIPTION_ES,
  ORCHESTRATOR_MODE_LABEL_ES,
  ORCHESTRATOR_STATUS_LABEL_ES,
  ORCHESTRATOR_STATUS_TW,
  OPENROUTER_CONNECTION_STATUS_LABEL_ES,
  OPENROUTER_CONNECTION_STATUS_TW,
} from '../lib/orchestratorStyles';
import type { Agent } from '../types';
import OpenRouterConnectionPanel from './OpenRouterConnectionPanel';
import OrquestadorModelosView from './OrquestadorModelosView';
import ViewHeader from './ui/ViewHeader';

// Presentational only, built against my own src/central-orchestrator/ +
// useOrchestratorFeed.ts (both mine — this is a brand-new area, not
// Codex's central-integrations/). See COORDINACION_CLAUDE_CODEX.md.
//
// This screen only records non-secret configuration (bot id, model name)
// and which mode is active. Hermes has four distinct pieces of state and
// this view is careful never to blur them together:
// - botId: identified by the admin, right here.
// - endpoint: provisioned by the backend (the bridge address) — read-only.
// - connectionId: provisioned by the backend as the authenticated bridge
//   connection — read-only, not a secret, but not admin-editable either.
// - hasSecret: whether a token exists in the backend — shown as a
//   presence indicator only, its value is never fetched or rendered here.
// No real connection is attempted here yet.
//
// "Canales de mando" below is purely descriptive — it explains that Hermes
// can take orders over direct chat, a group chat with the bot, or voice.
// It derives its two "live-ish" hints from data already in the binding
// (bridge/connection readiness, whether a bot is identified) instead of
// inventing new state — voice has no backing data anywhere yet, so it's
// honestly shown as not connected. Nothing here reaches a network.

type Props = { feed: OrchestratorFeed; agents: Agent[]; connectionFeed: OpenRouterConnectionFeed };

const MODES: OrchestratorMode[] = ['openrouter', 'hermes_telegram'];
const TABS: { id: 'conexion' | 'modelos'; label: string }[] = [
  { id: 'conexion', label: 'Conexión' },
  { id: 'modelos', label: 'Modelos por puesto' },
];

function ModeCard({
  mode,
  active,
  statusLabel,
  statusClassName,
  onSelect,
}: {
  mode: OrchestratorMode;
  active: boolean;
  statusLabel: string;
  statusClassName: string;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`text-left rounded-lg border p-4 flex-1 transition-colors ${
        active ? 'border-violet-400/40 bg-violet-500/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm text-white/90 font-medium">{ORCHESTRATOR_MODE_LABEL_ES[mode]}</span>
        {active && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-200">
            Modo activo
          </span>
        )}
      </div>
      <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed">{ORCHESTRATOR_MODE_DESCRIPTION_ES[mode]}</p>
      <span className={`inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusClassName}`}>
        {statusLabel}
      </span>
    </button>
  );
}

function SecretIndicator({ has, label }: { has: boolean; label: string }) {
  return (
    <div className="text-[11px] text-white/40 flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${has ? 'bg-emerald-400' : 'bg-white/20'}`} />
      {label}: {has ? 'presente en backend' : 'sin configurar'}
      <span className="text-white/25">— nunca se lee ni se escribe desde esta pantalla.</span>
    </div>
  );
}

/** A read-only piece of backend-provisioned state (never admin-editable, never a secret value). */
function BackendStatusRow({
  label,
  value,
  readyLabel,
  emptyHint,
}: {
  label: string;
  value: string | null;
  readyLabel: string;
  emptyHint: string;
}) {
  return (
    <div className="text-[11px] text-white/40 flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${value ? 'bg-emerald-400' : 'bg-white/20'}`} />
      {label}: <span className={value ? 'text-white/65' : ''}>{value ? readyLabel : emptyHint}</span>
    </div>
  );
}

type CommandChannel = {
  icon: LucideIcon;
  label: string;
  description: string;
  available: boolean;
  statusLabel: string;
};

function commandChannels(hermes: HermesTelegramConfig): CommandChannel[] {
  const bridgeReady = Boolean(hermes.endpoint && hermes.connectionId);
  return [
    {
      icon: MessageCircle,
      label: 'Chat directo',
      description: 'Conversación 1:1 con Hermes.',
      available: bridgeReady,
      statusLabel: bridgeReady ? 'Vía bridge autenticado' : 'Pendiente del bridge',
    },
    {
      icon: UsersRound,
      label: 'Grupo con bot',
      description: 'Un grupo donde participa el bot identificado arriba.',
      available: Boolean(hermes.botId),
      statusLabel: hermes.botId ? 'Bot identificado' : 'Sin bot identificado',
    },
    {
      icon: Mic,
      label: 'Voz',
      description: 'Órdenes por voz, cuando el backend lo habilite.',
      available: false,
      statusLabel: 'Sin conectar todavía',
    },
  ];
}

function ChannelRow({ channel }: { channel: CommandChannel }) {
  const Icon = channel.icon;
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`shrink-0 mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center ${
          channel.available ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300/80' : 'border-white/10 bg-white/[0.03] text-white/35'
        }`}
      >
        <Icon size={13} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-white/75 font-medium">{channel.label}</span>
          <span className={`text-[10px] ${channel.available ? 'text-emerald-300/70' : 'text-white/30'}`}>{channel.statusLabel}</span>
        </div>
        <p className="text-[10px] text-white/35 mt-0.5">{channel.description}</p>
      </div>
    </div>
  );
}

export default function OrquestadorView({ feed, agents, connectionFeed }: Props) {
  const { binding } = feed;
  const [tab, setTab] = useState<'conexion' | 'modelos'>('conexion');
  const [modelDraft, setModelDraft] = useState(binding.openrouter.model ?? '');
  const [botIdDraft, setBotIdDraft] = useState(binding.hermesTelegram.botId ?? '');
  const visibleTabs = binding.activeMode === 'openrouter' ? TABS : TABS.filter((item) => item.id === 'conexion');

  const openRouterDirty = modelDraft.trim() !== (binding.openrouter.model ?? '');
  const hermesDirty = botIdDraft.trim() !== (binding.hermesTelegram.botId ?? '');

  const selectMode = (mode: OrchestratorMode) => {
    setTab('conexion');
    feed.selectMode(mode);
  };

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={Plug}
        eyebrow="Oficina Virtual · Solo superadministración"
        title="Conexión del Orquestador"
        description="Elige cómo se orquesta este workspace: con un modelo propio vía OpenRouter o delegando en Hermes como Orquestador externo. Ningún secreto se gestiona desde aquí."
        guide={{
          title: 'Antes de activar un modo',
          items: [
            'OpenRouter: el Coordinador de la oficina responde por sí mismo con un modelo real.',
            'Hermes: Hermes es el Orquestador externo y puede recibir órdenes por chat directo, grupo de Telegram con el bot incluido o voz.',
            'El canal de mando solo indica por dónde entra la orden. Nunca es el destino obligatorio del resultado: una propuesta puede terminar enviada por WhatsApp vía YCloud sin volver al canal de mando.',
            'Identificador de bot y modelo se editan aquí. El bridge (endpoint) y la conexión autenticada los aprovisiona el backend — no son secretos, pero tampoco son editables desde esta pantalla. Tokens y API keys ni se editan ni se muestran nunca: solo se indica si ya existen.',
          ],
        }}
      />

      <div className="flex items-center gap-1 px-6 pt-3 border-b border-white/[0.06] shrink-0">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-[11px] font-medium px-3 py-2 border-b-2 transition-colors ${
              tab === t.id ? 'border-violet-400 text-white' : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 max-w-3xl">
        {tab === 'modelos' && binding.activeMode === 'openrouter' ? (
          <OrquestadorModelosView feed={feed} agents={agents} />
        ) : (
          <>
        {feed.error && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3 text-xs text-rose-200/85">
            {ORCHESTRATOR_ERROR_LABEL_ES[feed.error as OrchestratorMutationErrorCode] ?? feed.error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {MODES.map((mode) => (
            <ModeCard
              key={mode}
              mode={mode}
              active={binding.activeMode === mode}
              statusLabel={mode === 'openrouter'
                ? OPENROUTER_CONNECTION_STATUS_LABEL_ES[connectionFeed.binding.status]
                : ORCHESTRATOR_STATUS_LABEL_ES[binding.hermesTelegram.status]}
              statusClassName={mode === 'openrouter'
                ? OPENROUTER_CONNECTION_STATUS_TW[connectionFeed.binding.status]
                : ORCHESTRATOR_STATUS_TW[binding.hermesTelegram.status]}
              onSelect={() => selectMode(mode)}
            />
          ))}
        </div>

        {binding.activeMode === 'openrouter' ? (
          <>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Modelo principal de OpenRouter</div>
          </div>
          <label className="text-[10px] uppercase tracking-wide text-white/30">Modelo</label>
          <input
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            placeholder="p. ej. anthropic/claude-sonnet-4.5"
            className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={() => feed.updateOpenRouterConfig(modelDraft.trim() || null)}
              disabled={!openRouterDirty}
              className="shrink-0 onyx-control text-[11px] font-medium text-white/80 px-3 py-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Guardar modelo
            </button>
          </div>
        </div>

        <OpenRouterConnectionPanel feed={connectionFeed} />
          </>
        ) : (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Hermes como Orquestador</div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${ORCHESTRATOR_STATUS_TW[binding.hermesTelegram.status]}`}>
              {ORCHESTRATOR_STATUS_LABEL_ES[binding.hermesTelegram.status]}
            </span>
          </div>
          <p className="text-[11px] text-white/35 mb-3 leading-relaxed">
            Hermes puede recibir órdenes por chat directo, por un grupo donde está incluido el bot o por voz cuando el backend lo habilite.
            Para la variante Telegram identificas qué bot pertenece al workspace; el bridge, la conexión autenticada y el token los
            aprovisiona y reporta el backend.
          </p>
          <label className="text-[10px] uppercase tracking-wide text-white/30">Bot de Telegram (si aplica)</label>
          <input
            value={botIdDraft}
            onChange={(e) => setBotIdDraft(e.target.value)}
            placeholder="@tu_bot"
            className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
          />
          <div className="flex items-center justify-end mt-1.5">
            <button
              onClick={() => feed.updateHermesBotId(botIdDraft.trim() || null)}
              disabled={!hermesDirty}
              className="shrink-0 onyx-control text-[11px] font-medium text-white/80 px-3 py-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Guardar identificador
            </button>
          </div>

          <div className="rounded-md border border-white/[0.05] bg-black/20 p-3 mt-3 space-y-2.5">
            <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Canales de mando · descriptivo, sin conexión real</div>
            {commandChannels(binding.hermesTelegram).map((channel) => (
              <ChannelRow key={channel.label} channel={channel} />
            ))}
          </div>

          <div className="rounded-md border border-white/[0.05] bg-black/20 p-3 mt-3 space-y-2">
            <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Gestionado por el backend — no editable aquí</div>
            <BackendStatusRow
              label="Bridge"
              value={binding.hermesTelegram.endpoint}
              readyLabel="aprovisionado por backend"
              emptyHint="aún no aprovisionado"
            />
            <BackendStatusRow
              label="Conexión autenticada"
              value={binding.hermesTelegram.connectionId}
              readyLabel="autenticada por backend"
              emptyHint="sin conexión autenticada todavía"
            />
            <SecretIndicator has={binding.hermesTelegram.hasSecret} label="Token del bot" />
          </div>
        </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
