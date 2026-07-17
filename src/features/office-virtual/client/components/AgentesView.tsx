import { AGENT_ORDER } from '../../agents/registry';
import type { AgentId } from '../../schemas';
import { Building2, ContactRound, MessageSquareText, Network, ShieldCheck, UsersRound } from 'lucide-react';
import type { OfficeSeatBinding } from '../central-events/agent-bindings';
import type { AgentActivitySnapshot, OfficeActivityEvent } from '../central-events/types';
import { relativeTime } from '../lib/relativeTime';
import { SOURCE_LABEL_ES, SOURCE_TW_TEXT, STATUS_LABEL_ES, STATUS_TW_BG } from '../lib/statusStyles';
import type { Agent } from '../types';
import ViewHeader from './ui/ViewHeader';

type Props = {
  agents: Agent[];
  snapshots: Record<AgentId, AgentActivitySnapshot>;
  onOpenOffice: (id: string) => void;
  onOpenChat: (id: string) => void;
  resolveContactId: (event: OfficeActivityEvent | null | undefined) => string | null;
  onOpenContact: (contactId: string) => void;
};

// Honest about what's real today: no live connections yet, just which real
// SaaS seat this office role stands in for. Driven by OFFICE_SEAT_BINDINGS
// so it can't say more than the contract actually knows.
function seatBadge(seat: OfficeSeatBinding): { label: string; className: string } | null {
  if (seat.role === 'orchestrator') return null;
  if (seat.configurable) {
    return { label: 'Puesto configurable', className: 'text-violet-300/70 border-violet-400/25 bg-violet-500/[0.05]' };
  }
  if (seat.backendReady) {
    const target = seat.role === 'whatsapp' ? 'WhatsApp' : seat.role === 'voice' ? 'Vapi' : 'el SaaS';
    return {
      label: `Listo para conectar a ${target}`,
      className: 'text-emerald-300/70 border-emerald-500/25 bg-emerald-500/[0.05]',
    };
  }
  return { label: 'Sin conexión real todavía', className: 'text-white/40 border-white/10 bg-white/[0.03]' };
}

export default function AgentesView({ agents, snapshots, onOpenOffice, onOpenChat, resolveContactId, onOpenContact }: Props) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps are meant to reflect wall-clock time at render.
  const now = Date.now();
  const ordered = AGENT_ORDER.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => Boolean(a));
  const workingCount = ordered.filter((agent) => agent.status === 'working').length;
  const activeTasks = ordered.reduce((total, agent) => total + (snapshots[agent.id]?.activeCount ?? 0), 0);

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={UsersRound}
        title="Agentes"
        description="Supervisa responsabilidades, carga y actividad reciente de todo el equipo desde un único lugar."
        meta={
          <div className="flex items-center gap-2 text-[10px] text-white/45">
            <span className="onyx-header-stat"><span className="bg-emerald-400" />{workingCount} trabajando</span>
            <span className="onyx-header-stat"><span className="bg-violet-400" />{activeTasks} tareas activas</span>
          </div>
        }
        guide={{
          title: 'Cómo leer esta vista',
          items: [
            'El estado indica la situación operativa real del agente; no si el chat está abierto.',
            'Abrir despacho localiza al agente en la oficina. Conversación abre su canal de trabajo.',
            'WhatsApp y Voz son puestos protegidos: su configuración principal vive en sus plataformas de origen.',
          ],
        }}
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="mb-4 flex items-center gap-2 text-[11px] text-white/35">
          <Network size={14} className="text-violet-300/60" />
          <span>{ordered.length} puestos configurados</span>
          <span className="text-white/15">·</span>
          <span>Actividad sincronizada con la oficina</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-[1240px]">
          {ordered.map((agent) => {
            const snapshot = snapshots[agent.id];
            const event = snapshot?.event ?? null;
            const channelIsLive = snapshot ? snapshot.status !== 'available' && snapshot.status !== 'completed' : false;
            const badge = seatBadge(agent.seat);
            const contactId = resolveContactId(event);

            return (
              <div
                key={agent.id}
                className="onyx-agent-card flex flex-col"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className="w-12 h-12 rounded-md flex items-center justify-center text-xs font-bold border shrink-0"
                    style={{ background: `linear-gradient(145deg, ${agent.color}3d, #0b0910 70%)`, borderColor: agent.color }}
                  >
                    {agent.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold text-white truncate">{agent.name}</span>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_TW_BG[agent.status]}`} />
                        </div>
                        <div className="text-xs text-white/55 truncate mt-0.5">{agent.role}</div>
                      </div>
                      <span className="onyx-agent-card__department">{agent.department}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="onyx-agent-state">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_TW_BG[agent.status]}`} />
                      {STATUS_LABEL_ES[agent.status]}
                    </span>
                    {badge && (
                      <span className={`text-[10px] font-medium px-2 py-1 rounded-full border ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/45 leading-relaxed mt-3 min-h-[38px]">{agent.description}</p>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-3 mt-4">
                  <div className="onyx-agent-activity">
                    <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Última actividad</div>
                    {event ? (
                      <>
                        <div className="text-xs text-white/85 truncate">{event.title}</div>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/40">
                          <span className={channelIsLive ? SOURCE_TW_TEXT[event.source] : ''}>
                            {SOURCE_LABEL_ES[event.source]}
                          </span>
                          <span>·</span>
                          <span>{relativeTime(event.occurredAt, now)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-white/30">Sin actividad reciente</div>
                    )}
                  </div>
                  <div className="onyx-agent-load">
                    <div className="text-white/30 text-[10px] uppercase tracking-wide">Carga</div>
                    <div className="text-xl text-white font-semibold mt-1">{snapshot?.activeCount ?? 0}</div>
                    <div className="text-[9px] text-white/25">tareas activas</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-auto pt-4">
                  <button
                    onClick={() => onOpenOffice(agent.id)}
                    className="onyx-control flex-1 min-w-[138px] text-xs font-medium text-white/80 px-3 py-2.5 transition-colors flex items-center justify-center gap-2"
                  >
                    <Building2 size={14} /> Despacho
                  </button>
                  <button
                    onClick={() => onOpenChat(agent.id)}
                    className="flex-1 min-w-[138px] bg-violet-600 hover:bg-violet-500 text-white rounded-md px-3 py-2.5 text-xs font-semibold transition-colors border border-violet-400/25 flex items-center justify-center gap-2"
                  >
                    <MessageSquareText size={14} /> Conversación
                  </button>
                  {contactId && (
                    <button
                      onClick={() => onOpenContact(contactId)}
                      className="w-full text-xs font-medium text-emerald-300/80 hover:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/10 rounded-md px-3 py-2.5 transition-colors flex items-center justify-center gap-2"
                    >
                      <ContactRound size={14} /> Ver contacto 360
                    </button>
                  )}
                </div>
                {(agent.seat.role === 'whatsapp' || agent.seat.role === 'voice') && (
                  <div className="flex items-center gap-1.5 text-[10px] text-white/28 mt-3">
                    <ShieldCheck size={12} /> Puesto protegido y conectado desde su plataforma de origen
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
