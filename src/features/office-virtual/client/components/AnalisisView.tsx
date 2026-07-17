import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { AgentId } from '../../schemas';
import type { AgentWorkloadAnalytics, WorkspaceAnalytics } from '../central-analytics/types';
import type { AnalyticsPeriod } from '../central-events';
import type { OfficeActivitySource } from '../central-events/types';
import type { TaskSource } from '../central-tasks';
import { ANALYTICS_PERIOD_LABEL_ES, TASK_SOURCE_LABEL_ES } from '../lib/analyticsStyles';
import { SOURCE_LABEL_ES } from '../lib/statusStyles';
import type { Agent } from '../types';
import ViewHeader from './ui/ViewHeader';

type Props = {
  analytics: WorkspaceAnalytics | null;
  error: 'workspace_mismatch' | 'unauthorized' | null;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  agents: Agent[];
};

const PERIODS: AnalyticsPeriod[] = ['today', '24h', '7d', '30d'];
const ACTIVITY_SOURCES: OfficeActivitySource[] = ['whatsapp', 'voice', 'manual', 'automation'];
const TASK_SOURCES: TaskSource[] = ['manual', 'whatsapp', 'voice', 'automation', 'routine'];

function formatMs(ms: number | null): string {
  if (ms === null) return 'Sin datos';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-3">{title}</div>
      {children}
    </div>
  );
}

function KpiTile({
  label,
  value,
  change,
  goodDirection,
}: {
  label: string;
  value: number | string;
  change: number | null;
  goodDirection?: 'up' | 'down';
}) {
  let changeColor = 'text-white/35';
  if (change !== null && change !== 0 && goodDirection) {
    const positive = change > 0;
    const good = goodDirection === 'up' ? positive : !positive;
    changeColor = good ? 'text-emerald-300/80' : 'text-rose-300/80';
  }
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-[10px] uppercase tracking-wide text-white/30 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      {change !== null ? (
        <div className={`text-[11px] mt-1 ${changeColor}`}>
          {change > 0 ? '▲' : change < 0 ? '▼' : '·'} {Math.abs(change)}% vs periodo anterior
        </div>
      ) : (
        <div className="text-[11px] mt-1 text-white/20">Sin periodo anterior</div>
      )}
    </div>
  );
}

function MagnitudeBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-white/50 w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-white/70 w-7 text-right shrink-0">{value}</span>
    </div>
  );
}

function AgentRow({ agent, workload }: { agent: Agent; workload: AgentWorkloadAnalytics }) {
  return (
    <tr className="border-t border-white/[0.05]">
      <td className="py-2 pr-3 text-xs text-white/80">{agent.name}</td>
      <td className="py-2 px-3 text-xs text-white/60 text-right">{workload.assignedTasks}</td>
      <td className="py-2 px-3 text-xs text-white/60 text-right">{workload.openTasks}</td>
      <td className="py-2 px-3 text-xs text-emerald-300/70 text-right">{workload.completedTasks}</td>
      <td className="py-2 px-3 text-xs text-rose-300/70 text-right">{workload.overdueTasks}</td>
      <td className="py-2 pl-3 text-xs text-white/60 text-right">{workload.activeRoutines}</td>
    </tr>
  );
}

export default function AnalisisView({ analytics, error, period, onPeriodChange, agents }: Props) {
  const [agentFilter, setAgentFilter] = useState<AgentId | 'all'>('all');

  const hasData =
    analytics &&
    (analytics.activity.current.activities > 0 || analytics.tasks.createdInPeriod > 0 || analytics.routines.runsInPeriod > 0);

  const visibleAgents =
    analytics?.agents.filter((w) => agentFilter === 'all' || w.agentId === agentFilter).sort((a, b) => b.assignedTasks - a.assignedTasks) ?? [];

  const maxTaskSource = analytics ? Math.max(1, ...TASK_SOURCES.map((s) => analytics.tasks.bySource[s])) : 1;
  const maxActivitySource = analytics ? Math.max(1, ...ACTIVITY_SOURCES.map((s) => analytics.activity.current.bySource[s])) : 1;

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={BarChart3}
        eyebrow="Oficina Virtual · Datos simulados"
        title="Analíticas"
        description="Compara rendimiento, carga y evolución operativa por agente, canal y periodo."
        guide={{
          title: 'Cómo interpretar los datos',
          items: [
            'Confirma primero el periodo seleccionado antes de comparar resultados.',
            'Filtra por agente para distinguir rendimiento individual de carga global.',
            'Los datos actuales son simulados hasta conectar las fuentes reales del workspace.',
          ],
        }}
      />

      <div className="px-6 pt-3 pb-2 border-b border-white/[0.06] shrink-0 flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors ${
              period === p ? 'border-violet-400/40 bg-violet-500/10 text-violet-200' : 'border-white/10 text-white/45 hover:text-white/70'
            }`}
          >
            {ANALYTICS_PERIOD_LABEL_ES[p]}
          </button>
        ))}
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter((e.target.value || 'all') as AgentId | 'all')}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px] ml-auto"
        >
          <option value="all">Todos los agentes</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!analytics ? (
          <div className="text-sm text-white/30 text-center mt-12">
            No se pudieron calcular las métricas{error ? ` (${error})` : ''}.
          </div>
        ) : !hasData ? (
          <div className="text-sm text-white/30 text-center mt-12">Sin datos para este periodo.</div>
        ) : (
          <div className="space-y-4 max-w-5xl">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label="Actividad" value={analytics.activity.current.activities} change={analytics.activity.changes.activities} />
              <KpiTile
                label="Completadas"
                value={analytics.activity.current.completed}
                change={analytics.activity.changes.completed}
                goodDirection="up"
              />
              <KpiTile label="Bloqueadas" value={analytics.activity.current.blocked} change={null} goodDirection="down" />
              <KpiTile
                label="Requieren aprobación"
                value={analytics.activity.current.approvalsRequired}
                change={analytics.activity.changes.approvalsRequired}
                goodDirection="down"
              />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card title="Tareas">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wide">Tasa de finalización</div>
                    <div className="text-lg text-white/85 font-medium">{analytics.tasks.completionRate}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wide">Tiempo medio de finalización</div>
                    <div className="text-lg text-white/85 font-medium">{formatMs(analytics.tasks.averageCompletionMs)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wide">Espera media de aprobación</div>
                    <div className="text-lg text-white/85 font-medium">{formatMs(analytics.tasks.averageApprovalWaitMs)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wide">Creadas / completadas / fallidas</div>
                    <div className="text-lg text-white/85 font-medium">
                      {analytics.tasks.createdInPeriod} / {analytics.tasks.completedInPeriod} / {analytics.tasks.failedInPeriod}
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-white/30 uppercase tracking-wide mb-1.5">Por origen</div>
                <div className="space-y-1.5">
                  {TASK_SOURCES.map((s) => (
                    <MagnitudeBar key={s} label={TASK_SOURCE_LABEL_ES[s]} value={analytics.tasks.bySource[s]} max={maxTaskSource} />
                  ))}
                </div>
              </Card>

              <Card title="Rutinas">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wide">Tasa de éxito</div>
                    <div className="text-lg text-white/85 font-medium">{analytics.routines.successRate}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wide">Duración media</div>
                    <div className="text-lg text-white/85 font-medium">{formatMs(analytics.routines.averageRunMs)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wide">Ejecuciones en el periodo</div>
                    <div className="text-lg text-white/85 font-medium">{analytics.routines.runsInPeriod}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wide">Completadas / fallidas / canceladas</div>
                    <div className="text-lg text-white/85 font-medium">
                      {analytics.routines.completedRuns} / {analytics.routines.failedRuns} / {analytics.routines.cancelledRuns}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <Card title="Actividad por canal">
              <div className="space-y-1.5">
                {ACTIVITY_SOURCES.map((s) => (
                  <MagnitudeBar key={s} label={SOURCE_LABEL_ES[s]} value={analytics.activity.current.bySource[s]} max={maxActivitySource} />
                ))}
              </div>
            </Card>

            <Card title="Por agente">
              {visibleAgents.length === 0 ? (
                <p className="text-xs text-white/30">Sin datos para este agente.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-white/30">
                        <th className="text-left font-medium pb-1.5 pr-3">Agente</th>
                        <th className="text-right font-medium pb-1.5 px-3">Asignadas</th>
                        <th className="text-right font-medium pb-1.5 px-3">Abiertas</th>
                        <th className="text-right font-medium pb-1.5 px-3">Completadas</th>
                        <th className="text-right font-medium pb-1.5 px-3">Vencidas</th>
                        <th className="text-right font-medium pb-1.5 pl-3">Rutinas activas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAgents.map((workload) => {
                        const agent = agents.find((a) => a.id === workload.agentId);
                        if (!agent) return null;
                        return <AgentRow key={workload.agentId} agent={agent} workload={workload} />;
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
