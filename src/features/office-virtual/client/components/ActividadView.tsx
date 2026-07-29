import { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';
import type { OfficeActivityEvent } from '../central-events/types';
import { relativeTime } from '../lib/relativeTime';
import { SOURCE_LABEL_ES, SOURCE_TW_TEXT, STATUS_LABEL_ES, STATUS_TW_BG } from '../lib/statusStyles';
import type { Agent } from '../types';
import ViewHeader from './ui/ViewHeader';

type Props = {
  events: OfficeActivityEvent[];
  agents: Agent[];
  onSelectAgent: (id: string) => void;
  resolveContactId: (event: OfficeActivityEvent | null | undefined) => string | null;
  onOpenContact: (contactId: string) => void;
  highlightedEventId?: string | null;
  openRequestId?: number;
};

const ENTITY_LABEL_ES: Record<string, string> = {
  contact: 'Contacto',
  conversation: 'Conversación',
  voice_call: 'Llamada',
  deal: 'Oportunidad',
  project: 'Proyecto',
  task: 'Tarea',
  appointment: 'Cita',
  template: 'Plantilla',
};

export default function ActividadView({ events, agents, onSelectAgent, resolveContactId, onOpenContact, highlightedEventId, openRequestId }: Props) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps are meant to reflect wall-clock time at render.
  const now = Date.now();
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const highlightedRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightedEventId, openRequestId]);

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={Activity}
        title="Actividad"
        description="Registro cronológico de WhatsApp, voz, automatizaciones y tareas manuales de toda la oficina."
        meta={<span className="text-[10px] text-white/35">{events.length} eventos recientes</span>}
        guide={{
          title: 'Qué representa este registro',
          items: [
            'Cada entrada conserva agente, canal, estado y hora del evento.',
            'Selecciona una actividad para localizar al agente responsable.',
            'Cuando exista un contacto relacionado podrás abrir directamente su perfil 360.',
          ],
        }}
      />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {events.length === 0 ? (
          <div className="text-sm text-white/30 text-center mt-12">Todavía no hay actividad registrada.</div>
        ) : (
          <ul className="space-y-1.5">
            {events.map((event) => {
              const agent = agentById.get(event.agentId);
              const contactId = resolveContactId(event);
              return (
                <li key={event.id} ref={event.id === highlightedEventId ? highlightedRef : undefined}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectAgent(event.agentId)}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectAgent(event.agentId)}
                    className={`w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-lg hover:bg-white/[0.035] transition-colors cursor-pointer ${
                      event.id === highlightedEventId ? 'bg-violet-500/[0.08] ring-1 ring-violet-400/30' : ''
                    }`}
                  >
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${STATUS_TW_BG[event.status]}`} />

                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                      style={
                        agent
                          ? { background: `${agent.color}33`, color: agent.color, border: `1px solid ${agent.color}66` }
                          : undefined
                      }
                    >
                      {(agent?.name ?? event.agentId).slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white/90 truncate">{event.title}</div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-white/40 mt-0.5">
                        <span className="text-white/60">{agent?.department ?? event.agentId}</span>
                        <span>·</span>
                        <span className={SOURCE_TW_TEXT[event.source]}>{SOURCE_LABEL_ES[event.source]}</span>
                        <span>·</span>
                        <span>{STATUS_LABEL_ES[event.status]}</span>
                        {event.entityType && (
                          <>
                            <span>·</span>
                            <span>{ENTITY_LABEL_ES[event.entityType] ?? event.entityType}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{relativeTime(event.occurredAt, now)}</span>
                      </div>
                    </div>

                    {contactId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenContact(contactId);
                        }}
                        className="shrink-0 self-center text-[11px] font-medium text-emerald-300/70 hover:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/10 rounded-md px-2.5 py-1 transition-colors"
                      >
                        Ver contacto
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
