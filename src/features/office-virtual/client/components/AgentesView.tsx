import type { AgentId } from '../../schemas';
import { Building2, ContactRound, MessageSquareText, Network, UsersRound } from 'lucide-react';
import type { AgentActivitySnapshot, OfficeActivityEvent } from '../central-events/types';
import { relativeTime } from '../lib/relativeTime';
import { SOURCE_LABEL_ES, SOURCE_TW_TEXT, STATUS_LABEL_ES, STATUS_TW_BG } from '../lib/statusStyles';
import type { OfficeRoomSlot } from '../three/officeRoster';
import type { Agent } from '../types';
import ViewHeader from './ui/ViewHeader';

type Props = {
  agents: Agent[];
  rooms: OfficeRoomSlot[];
  snapshots: Record<AgentId, AgentActivitySnapshot>;
  onOpenOffice: (id: string) => void;
  onOpenChat: (id: string) => void;
  resolveContactId: (event: OfficeActivityEvent | null | undefined) => string | null;
  onOpenContact: (contactId: string) => void;
};

export default function AgentesView({ agents, rooms, snapshots, onOpenOffice, onOpenChat, resolveContactId, onOpenContact }: Props) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps are meant to reflect wall-clock time at render.
  const now = Date.now();
  const activeAgents = rooms
    .filter((room) => room.occupant !== null)
    .map((room) => {
      const occupant = room.occupant!;
      const legacyAgent = agents.find((agent) => agent.id === occupant.id);
      const snapshot = legacyAgent ? snapshots[legacyAgent.id] : undefined;
      return { occupant, legacyAgent, snapshot };
    });
  const workingCount = activeAgents.filter(({ snapshot }) => snapshot?.status === 'working').length;
  const activeTasks = activeAgents.reduce((total, { snapshot }) => total + (snapshot?.activeCount ?? 0), 0);

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={UsersRound}
        title="Equipo digital"
        description="Aquí solo aparecen los especialistas y canales que están realmente activos en esta empresa."
        meta={
          <div className="flex items-center gap-2 text-[10px] text-white/45">
            <span className="onyx-header-stat"><span className="bg-emerald-400" />{workingCount} trabajando</span>
            <span className="onyx-header-stat"><span className="bg-violet-400" />{activeTasks} tareas activas</span>
          </div>
        }
        guide={{
          title: 'Cómo leer esta vista',
          items: [
            'Cada tarjeta corresponde a un puesto visible en la oficina.',
            'Si desactivas un especialista, su nombre y sus datos dejan de aparecer aquí.',
            'Las conversaciones solo se ofrecen en puestos que disponen de ese canal.',
          ],
        }}
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="mb-4 flex items-center gap-2 text-[11px] text-white/35">
          <Network size={14} className="text-violet-300/60" />
          <span>{activeAgents.length} puestos activos</span>
          <span className="text-white/15">·</span>
          <span>Sin mostrar puestos desactivados</span>
        </div>

        {activeAgents.length === 0 ? (
          <div className="onyx-empty-team">
            <div className="onyx-empty-team__icon"><UsersRound size={22} /></div>
            <h2>Tu equipo digital todavía no está activo</h2>
            <p>Cuando actives un especialista, WhatsApp, Voz o Chatbot, aparecerá aquí y ocupará su puesto en la oficina.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-[1240px]">
            {activeAgents.map(({ occupant: agent, legacyAgent, snapshot }) => {
              const event = snapshot?.event ?? null;
              const status = snapshot?.status ?? agent.status;
              const channelIsLive = snapshot ? snapshot.status !== 'available' && snapshot.status !== 'completed' : false;
              const contactId = resolveContactId(event);

              return (
                <article key={agent.id} className="onyx-agent-card flex flex-col">
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
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_TW_BG[status]}`} />
                          </div>
                          <div className="text-xs text-white/55 truncate mt-0.5">{agent.department}</div>
                        </div>
                        <span className="onyx-agent-card__department">Activo</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/[0.06]">
                    <span className="onyx-agent-state">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_TW_BG[status]}`} />
                      {STATUS_LABEL_ES[status]}
                    </span>
                    <p className="text-xs text-white/45 leading-relaxed mt-3 min-h-[38px]">Listo para ayudarte desde su puesto en la Oficina Virtual.</p>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-3 mt-4">
                    <div className="onyx-agent-activity">
                      <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Última actividad</div>
                      {event ? (
                        <>
                          <div className="text-xs text-white/85 truncate">{event.title}</div>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/40">
                            <span className={channelIsLive ? SOURCE_TW_TEXT[event.source] : ''}>{SOURCE_LABEL_ES[event.source]}</span>
                            <span>·</span>
                            <span>{relativeTime(event.occurredAt, now)}</span>
                          </div>
                        </>
                      ) : <div className="text-xs text-white/30">Sin actividad reciente</div>}
                    </div>
                    <div className="onyx-agent-load">
                      <div className="text-white/30 text-[10px] uppercase tracking-wide">Carga</div>
                      <div className="text-xl text-white font-semibold mt-1">{snapshot?.activeCount ?? 0}</div>
                      <div className="text-[9px] text-white/25">tareas activas</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-auto pt-4">
                    <button onClick={() => onOpenOffice(agent.id)} className="onyx-control flex-1 min-w-[138px] text-xs font-medium text-white/80 px-3 py-2.5 transition-colors flex items-center justify-center gap-2">
                      <Building2 size={14} /> Ver en la oficina
                    </button>
                    {legacyAgent && (
                      <button onClick={() => onOpenChat(legacyAgent.id)} className="flex-1 min-w-[138px] bg-violet-600 hover:bg-violet-500 text-white rounded-md px-3 py-2.5 text-xs font-semibold transition-colors border border-violet-400/25 flex items-center justify-center gap-2">
                        <MessageSquareText size={14} /> Conversación
                      </button>
                    )}
                    {contactId && (
                      <button onClick={() => onOpenContact(contactId)} className="w-full text-xs font-medium text-emerald-300/80 hover:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/10 rounded-md px-3 py-2.5 transition-colors flex items-center justify-center gap-2">
                        <ContactRound size={14} /> Ver contacto 360
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
