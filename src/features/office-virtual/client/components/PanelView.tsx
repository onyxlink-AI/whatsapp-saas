import { AGENT_ORDER } from '../../agents/registry';
import { LayoutDashboard } from 'lucide-react';
import {
  selectAgentActivityMetrics,
  selectAttentionActivities,
  selectOfficeOverview,
  selectSourceActivityMetrics,
} from '../central-events';
import type { OfficeActivityState } from '../central-events/types';
import { relativeTime } from '../lib/relativeTime';
import { SOURCE_LABEL_ES, SOURCE_TW_TEXT, STATUS_LABEL_ES, STATUS_TW_BG } from '../lib/statusStyles';
import type { Agent } from '../types';
import ViewHeader from './ui/ViewHeader';

type Props = {
  state: OfficeActivityState;
  agents: Agent[];
  activeSeatCount: number;
  onSelectAgent: (id: string) => void;
};

type StatCard = { label: string; value: number; total?: number; color: string };

export default function PanelView({ state, agents, activeSeatCount, onSelectAgent }: Props) {
  // eslint-disable-next-line react-hooks/purity -- the office overview snapshot is meant to reflect wall-clock time at render.
  const now = Date.now();
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const overview = selectOfficeOverview(state, AGENT_ORDER, now);
  const sourceMetrics = selectSourceActivityMetrics(state);

  // selectAttentionActivities already splits failed/blocked/approval_required —
  // limit high enough to cover MAX_TRACKED_ACTIVITIES so the counts are exact.
  const attentionEvents = selectAttentionActivities(state, 500);
  const errorsAndBlocks = attentionEvents.filter((e) => e.status === 'failed' || e.status === 'blocked').length;
  const pendingApprovals = attentionEvents.filter((e) => e.status === 'approval_required').length;
  const latestAlerts = attentionEvents.slice(0, 6);

  const topAgents = selectAgentActivityMetrics(state, AGENT_ORDER, now)
    .filter((metric) => metric.total > 0)
    .sort((a, b) => b.active - a.active || b.total - a.total)
    .slice(0, 6);

  const stats: StatCard[] = [
    { label: 'Miembros trabajando ahora', value: overview.workingAgents, total: activeSeatCount, color: '#fbbf24' },
    { label: 'Actividades en cola', value: overview.queuedActivities, color: '#38bdf8' },
    { label: 'Tareas completadas', value: overview.completedActivities, color: '#5eead4' },
    { label: 'Errores y bloqueos', value: errorsAndBlocks, color: '#f43f5e' },
    { label: 'Aprobaciones pendientes', value: pendingApprovals, color: '#79CBCA' },
  ];

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={LayoutDashboard}
        title="Panel operativo"
        description="Una lectura rápida de carga, actividad y situaciones que necesitan una decisión humana."
        guide={{
          title: 'Orden de revisión recomendado',
          items: [
            'Resuelve primero bloqueos y aprobaciones pendientes.',
            'Comprueba después la carga por agente y los elementos en cola.',
            'Usa la actividad por canal para detectar interrupciones o desequilibrios.',
          ],
        }}
      />

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold" style={{ color: stat.color }}>
                  {stat.value}
                </span>
                {stat.total !== undefined && <span className="text-xs text-white/30">/ {stat.total}</span>}
              </div>
              <div className="mt-1 text-[11px] text-white/45 leading-snug">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-3">
              Actividad por canal
            </div>
            <div className="space-y-3">
              {sourceMetrics.map((metric) => {
                const activeShare = metric.total > 0 ? (metric.active / metric.total) * 100 : 0;
                return (
                  <div key={metric.source}>
                    <div className="flex items-center justify-between gap-2 text-xs mb-1">
                      <span className={`font-medium shrink-0 ${SOURCE_TW_TEXT[metric.source]}`}>
                        {SOURCE_LABEL_ES[metric.source]}
                      </span>
                      <span className="text-white/40 text-[11px] text-right">
                        {metric.total} total · {metric.active} activas · {metric.completed} completadas
                        {metric.attention > 0 ? ` · ${metric.attention} con incidencias` : ''}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <div className="h-full rounded-full bg-[#8AD3D2]/70" style={{ width: `${activeShare}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-3">
              Agentes con mayor carga
            </div>
            {topAgents.length === 0 ? (
              <div className="text-xs text-white/30 py-2">Sin actividad registrada todavía.</div>
            ) : (
              <ul className="space-y-1">
                {topAgents.map((metric) => {
                  const agent = agentById.get(metric.agentId);
                  return (
                    <li key={metric.agentId}>
                      <button
                        onClick={() => onSelectAgent(metric.agentId)}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-white/[0.035] transition-colors text-left"
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                          style={
                            agent
                              ? { background: `${agent.color}33`, color: agent.color, border: `1px solid ${agent.color}66` }
                              : undefined
                          }
                        >
                          {(agent?.name ?? metric.agentId).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-white/90 truncate">{agent?.name ?? metric.agentId}</div>
                          <div className="text-[10px] text-white/35 truncate">
                            {agent?.department ?? ''} · {STATUS_LABEL_ES[metric.snapshot.status]}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-white/70 shrink-0">{metric.active}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-3">
            Últimas alertas prioritarias
          </div>
          {latestAlerts.length === 0 ? (
            <div className="text-xs text-white/30 py-2">No hay alertas activas. Todo en orden.</div>
          ) : (
            <ul className="space-y-1">
              {latestAlerts.map((event) => {
                const agent = agentById.get(event.agentId);
                return (
                  <li key={event.id}>
                    <button
                      onClick={() => onSelectAgent(event.agentId)}
                      className="w-full flex items-start gap-3 text-left px-2 py-2 rounded-md hover:bg-white/[0.035] transition-colors"
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${STATUS_TW_BG[event.status]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white/90 truncate">{event.title}</div>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-white/40 mt-0.5">
                          <span className="text-white/60">{agent?.name ?? event.agentId}</span>
                          <span>·</span>
                          <span>{STATUS_LABEL_ES[event.status]}</span>
                          <span>·</span>
                          <span className={SOURCE_TW_TEXT[event.source]}>{SOURCE_LABEL_ES[event.source]}</span>
                          <span>·</span>
                          <span>{relativeTime(event.occurredAt, now)}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
