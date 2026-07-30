import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import type { AgentId } from '../../schemas';
import type { InboxFeed } from '../hooks/useInboxFeed';
import {
  ATTENTION_REASON_LABEL_ES,
  INBOX_PRIORITY_LABEL_ES,
  INBOX_PRIORITY_TW,
  INBOX_STATUS_LABEL_ES,
  INBOX_STATUS_TW,
} from '../lib/conversationStateStyles';
import { relativeTime } from '../lib/relativeTime';
import { SOURCE_LABEL_ES } from '../lib/statusStyles';
import type { Agent } from '../types';
import type { InboxThread, InboxThreadStatus, InboxPriority, InboxTimelineItem } from '../central-inbox/types';
import ViewHeader from './ui/ViewHeader';

type Props = {
  feed: InboxFeed;
  agents: Agent[];
  onOpenContact360: (contactId: string) => void;
  openContactId?: string | null;
  openRequestId?: number;
};

const CHANNEL_TABS: { id: 'all' | 'whatsapp' | 'voice'; label: string }[] = [
  { id: 'all', label: 'Todos los canales' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'voice', label: 'Voz' },
];

const RESPONSIBLE_AGENT_IDS: AgentId[] = ['coordinator', 'lead-intake', 'strategy'];

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} min ${rest}s` : `${rest}s`;
}

function agentName(agents: Agent[], agentId: AgentId): string {
  return agents.find((a) => a.id === agentId)?.name ?? agentId;
}

function ThreadRow({ thread, active, onSelect }: { thread: InboxThread; active: boolean; onSelect: () => void }) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamp is meant to reflect wall-clock time at render.
  const now = Date.now();
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-start gap-3 ${
        active ? 'border-[#8AD3D2]/30 bg-[#83CFCE]/[0.06]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.035]'
      }`}
    >
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 bg-white/[0.05] text-white/70 border border-white/[0.08]">
        {thread.displayName.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-white/90 truncate">{thread.displayName}</span>
          {thread.unreadCount > 0 && (
            <span className="text-[10px] font-semibold text-white bg-[#83CFCE] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
              {thread.unreadCount}
            </span>
          )}
        </div>
        <div className="text-[11px] text-white/40 truncate mt-0.5">{thread.latestPreview ?? 'Sin actividad reciente'}</div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {thread.channels.map((ch) => (
            <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/40">
              {ch === 'whatsapp' ? 'WhatsApp' : 'Voz'}
            </span>
          ))}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${INBOX_STATUS_TW[thread.status]}`}>
            {INBOX_STATUS_LABEL_ES[thread.status]}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${INBOX_PRIORITY_TW[thread.priority]}`}>
            {INBOX_PRIORITY_LABEL_ES[thread.priority]}
          </span>
          <span className="text-[10px] text-white/30 ml-auto shrink-0">{relativeTime(thread.latestAt, now)}</span>
        </div>
      </div>
    </button>
  );
}

function timelineIcon(item: InboxTimelineItem): string {
  return item.kind === 'message' ? (item.direction === 'out' ? '↗' : '↘') : '☎';
}

function ThreadDetail({
  thread,
  agents,
  onOpenContact360,
  onBack,
  drafts,
  onSendDraft,
}: {
  thread: InboxThread;
  agents: Agent[];
  onOpenContact360: (contactId: string) => void;
  onBack: () => void;
  drafts: string[];
  onSendDraft: (text: string) => void;
}) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps in the conversation are meant to reflect wall-clock time at render.
  const now = Date.now();
  const [draftText, setDraftText] = useState('');
  const messages = thread.timeline.filter((item) => item.kind === 'message');
  const calls = thread.timeline.filter((item) => item.kind === 'voice_call');

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
        <button onClick={onBack} className="sm:hidden text-xs text-white/45 hover:text-white/70 mb-2">
          ← Volver a la bandeja
        </button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-white font-semibold truncate">{thread.displayName}</h3>
            <div className="text-xs text-white/40 mt-0.5">{thread.phoneMasked}</div>
          </div>
          <button
            onClick={() => onOpenContact360(thread.contactId)}
            className="self-start shrink-0 whitespace-nowrap text-[11px] font-medium text-[#A0DCDB]/80 hover:text-[#BFE7E6] border border-[#8AD3D2]/25 hover:bg-[#83CFCE]/10 rounded-md px-2.5 py-1.5 transition-colors"
          >
            Ver Contacto 360
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${INBOX_STATUS_TW[thread.status]}`}>
            {INBOX_STATUS_LABEL_ES[thread.status]}
          </span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${INBOX_PRIORITY_TW[thread.priority]}`}>
            {INBOX_PRIORITY_LABEL_ES[thread.priority]}
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-white/45 border-white/10 bg-white/[0.03]">
            Agente responsable: {agentName(agents, thread.responsibleAgentId)}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
        {thread.attentionReasons.length > 0 && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/70 mb-1">Alertas y handoff</div>
            <ul className="text-xs text-amber-100/80 space-y-0.5">
              {thread.attentionReasons.map((reason) => (
                <li key={reason}>{ATTENTION_REASON_LABEL_ES[reason] ?? reason}</li>
              ))}
            </ul>
          </div>
        )}

        {messages.length > 0 && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
              Mensajes de WhatsApp (simulado)
            </div>
            <div className="space-y-2">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      msg.direction === 'out' ? 'bg-[#79CBCA]/25 text-[#102828]/90' : 'bg-white/[0.05] text-white/80'
                    }`}
                  >
                    <div>{msg.body ?? '(sin contenido)'}</div>
                    <div className="text-[10px] text-white/30 mt-1">{relativeTime(msg.occurredAt, now)}</div>
                  </div>
                </div>
              ))}
              {drafts.map((text, i) => (
                <div key={`draft-${i}`} className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed bg-white/[0.04] text-white/60 border border-dashed border-white/15">
                    <div>{text}</div>
                    <div className="text-[10px] text-white/30 mt-1">Borrador — sujeto a aprobación, no se envía</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Escribir un borrador (no se envía)..."
                className="onyx-input flex-1 rounded-md px-3 py-2 text-xs"
              />
              <button
                onClick={() => {
                  onSendDraft(draftText);
                  setDraftText('');
                }}
                className="bg-[#79CBCA] hover:bg-[#83CFCE] text-[#102828] rounded-md px-3 py-2 text-xs font-semibold transition-colors border border-[#8AD3D2]/25 shrink-0"
              >
                Añadir borrador
              </button>
            </div>
          </div>
        )}

        {calls.map((call) => (
          <div key={call.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-1.5">Llamada de voz</div>
            <p className="text-xs text-white/75 leading-relaxed">{call.summary ?? 'Sin resumen todavía.'}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-white/35">
              <span>{relativeTime(call.occurredAt, now)}</span>
              {formatDuration(call.durationSeconds) && (
                <>
                  <span>·</span>
                  <span>{formatDuration(call.durationSeconds)}</span>
                </>
              )}
              {call.endedReason && (
                <>
                  <span>·</span>
                  <span>{call.endedReason}</span>
                </>
              )}
            </div>
          </div>
        ))}

        {thread.timeline.length > 0 && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Timeline conjunto</div>
            <ul className="space-y-1.5">
              {thread.timeline.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="text-xs text-white/60 flex items-center gap-1.5">
                  <span className="w-4 text-center text-white/35 shrink-0">{timelineIcon(item)}</span>
                  <span className="truncate">
                    {item.kind === 'message'
                      ? item.body ?? '(sin contenido)'
                      : item.summary ?? 'Llamada de voz'}
                  </span>
                  <span className="text-white/25 shrink-0">· {SOURCE_LABEL_ES[item.channel]}</span>
                  <span className="text-white/25 ml-auto shrink-0">{relativeTime(item.occurredAt, now)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-1.5">Memoria compartida y etapa</div>
          <p className="text-xs text-white/70 leading-relaxed">{thread.memorySummary ?? 'Sin memoria registrada todavía.'}</p>
          <div className="text-[11px] text-white/35 mt-1">Etapa del lead: {thread.stage}</div>
        </div>

        <div className="rounded-lg border border-[#8AD3D2]/25 bg-[#83CFCE]/[0.05] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A0DCDB]/70 mb-1">Siguiente acción</div>
          <p className="text-xs text-white/85 leading-relaxed">{thread.nextAction ?? 'Sin recomendación todavía.'}</p>
        </div>

        <div className="text-[11px] text-white/35">
          {thread.pendingTasks === 0 ? 'Sin tareas pendientes.' : `${thread.pendingTasks} tarea(s) pendiente(s).`}
        </div>
      </div>
    </div>
  );
}

export default function BandejaView({ feed, agents, onOpenContact360, openContactId, openRequestId }: Props) {
  const { filteredThreads, filters, setFilters, resetFilters, stats, draftsByContact, addDraftMessage } = feed;
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const selectedThread = filteredThreads.find((t) => t.contactId === selectedContactId) ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a contact from global search is an external navigation signal (openRequestId), not derivable state.
    if (openContactId) setSelectedContactId(openContactId);
  }, [openContactId, openRequestId]);

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={Inbox}
        eyebrow="Oficina Virtual · Datos simulados"
        title="Bandeja multicanal"
        description="Reúne WhatsApp y Voz con responsable, prioridad, memoria y siguiente acción dentro de una misma conversación."
        meta={
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/35">
            {stats.unread > 0 && <span className="text-[#A0DCDB]/75">{stats.unread} pendientes</span>}
            <span>{stats.total} conversaciones · {stats.handoff} handoff</span>
          </div>
        }
        guide={{
          title: 'Atención multicanal',
          items: [
            'Prioriza conversaciones con alertas, handoff o mensajes sin leer.',
            'Comprueba responsable y memoria antes de preparar una respuesta.',
            'En el entorno actual todo envío queda como borrador sujeto a aprobación.',
          ],
        }}
      />

      <div className="px-6 pt-3 pb-2 border-b border-white/[0.06] shrink-0 flex flex-wrap items-center gap-2">
        <input
          value={filters.query ?? ''}
          onChange={(e) => setFilters({ query: e.target.value })}
          placeholder="Buscar por nombre o teléfono..."
          className="onyx-input rounded-md px-3 py-1.5 text-xs w-full max-w-[220px]"
        />
        {CHANNEL_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilters({ channel: tab.id === 'all' ? undefined : tab.id })}
            className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors ${
              (filters.channel ?? 'all') === tab.id ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/10 text-[#BFE7E6]' : 'border-white/10 text-white/45 hover:text-white/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <select
          value={filters.status ?? 'all'}
          onChange={(e) => setFilters({ status: e.target.value === 'all' ? undefined : (e.target.value as InboxThreadStatus) })}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
        >
          <option value="all">Todos los estados</option>
          {(Object.keys(INBOX_STATUS_LABEL_ES) as InboxThreadStatus[]).map((status) => (
            <option key={status} value={status}>
              {INBOX_STATUS_LABEL_ES[status]}
            </option>
          ))}
        </select>
        <select
          value={filters.assignedAgentId ?? 'all'}
          onChange={(e) => setFilters({ assignedAgentId: e.target.value === 'all' ? undefined : (e.target.value as AgentId) })}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
        >
          <option value="all">Todos los agentes</option>
          {RESPONSIBLE_AGENT_IDS.map((agentId) => (
            <option key={agentId} value={agentId}>
              {agentName(agents, agentId)}
            </option>
          ))}
        </select>
        <select
          value={filters.priority ?? 'all'}
          onChange={(e) => setFilters({ priority: e.target.value === 'all' ? undefined : (e.target.value as InboxPriority) })}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
        >
          <option value="all">Toda prioridad</option>
          {(Object.keys(INBOX_PRIORITY_LABEL_ES) as InboxPriority[]).map((p) => (
            <option key={p} value={p}>
              {INBOX_PRIORITY_LABEL_ES[p]}
            </option>
          ))}
        </select>
        <button onClick={resetFilters} className="onyx-control text-[11px] font-medium text-white/60 px-2.5 py-1.5 transition-colors">
          Limpiar filtros
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className={`${selectedContactId ? 'hidden sm:flex' : 'flex'} sm:w-[340px] shrink-0 flex-col border-r border-white/[0.06] overflow-y-auto px-3 py-3 gap-1.5`}>
          {filteredThreads.length === 0 ? (
            <div className="text-sm text-white/30 text-center mt-12">Sin conversaciones que coincidan con estos filtros.</div>
          ) : (
            filteredThreads.map((thread) => (
              <ThreadRow
                key={thread.contactId}
                thread={thread}
                active={thread.contactId === selectedContactId}
                onSelect={() => setSelectedContactId(thread.contactId)}
              />
            ))
          )}
        </div>

        <div className={`${selectedContactId ? 'flex' : 'hidden sm:flex'} flex-1 min-w-0`}>
          {selectedThread ? (
            <ThreadDetail
              thread={selectedThread}
              agents={agents}
              onOpenContact360={onOpenContact360}
              onBack={() => setSelectedContactId(null)}
              drafts={draftsByContact[selectedThread.contactId] ?? []}
              onSendDraft={(text) => addDraftMessage(selectedThread.contactId, text)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-white/25">
              Selecciona una conversación para ver el detalle.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
