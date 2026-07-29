import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { AgentId } from '../../schemas';
import type { AnalyticsPeriod } from '../central-events';
import type { CentralReport, ReportFormat, ReportKind } from '../central-reports';
import type { ReportsFeed } from '../hooks/useReportsFeed';
import { relativeTime } from '../lib/relativeTime';
import {
  REPORT_FORMAT_LABEL_ES,
  REPORT_KIND_DESCRIPTION_ES,
  REPORT_KIND_LABEL_ES,
  REPORT_KIND_ORDER,
  REPORT_PERIOD_LABEL_ES,
  REPORT_STATUS_LABEL_ES,
  REPORT_STATUS_TW,
  formatReportMetricValue,
  humanizeReportColumn,
} from '../lib/reportStyles';
import type { Agent } from '../types';
import ViewHeader from './ui/ViewHeader';

// Presentational only. Consumes Codex's real src/central-reports +
// src/hooks/useReportsFeed.ts (ReportsFeed) as-is — no reducer, fixtures or
// provisional hook here, and central-reports/useReportsFeed are untouched.
// Period/agent selection below is local UI state that parameterizes the next
// report to generate; it does not filter the already-generated list (each
// row already shows its own period/agents). See COORDINACION_CLAUDE_CODEX.md.

type Props = {
  feed: ReportsFeed;
  agents: Agent[];
  isSuperAdmin: boolean;
};

const PERIODS: AnalyticsPeriod[] = ['today', '24h', '7d', '30d'];

function agentNames(agents: Agent[], agentIds: AgentId[]): string {
  if (agentIds.length === 0) return 'Todos los agentes';
  return agentIds.map((id) => agents.find((a) => a.id === id)?.name ?? id).join(', ');
}

function ReportRow({
  report,
  agents,
  selected,
  onSelect,
  onGenerate,
  onDelete,
  onExport,
}: {
  report: CentralReport;
  agents: Agent[];
  selected: boolean;
  onSelect: () => void;
  onGenerate: () => void;
  onDelete: () => void;
  onExport: (format: ReportFormat) => void;
}) {
  const busy = report.status === 'generating';
  // eslint-disable-next-line react-hooks/purity -- "Actualizado hace X" is meant to reflect wall-clock time at render.
  const now = Date.now();
  return (
    <div
      className={`rounded-lg border p-3 transition-colors flex flex-col gap-2 ${
        selected ? 'border-violet-400/40 bg-violet-500/[0.08]' : 'border-white/[0.06] bg-white/[0.02]'
      }`}
    >
      <button onClick={onSelect} className="text-left flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-white/90 truncate">{report.title}</div>
          <div className="text-[11px] text-white/40 truncate mt-0.5">
            {REPORT_PERIOD_LABEL_ES[report.period]} · {agentNames(agents, report.agentIds)}
          </div>
        </div>
        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${REPORT_STATUS_TW[report.status]}`}>
          {busy && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse mr-1 align-middle" />}
          {REPORT_STATUS_LABEL_ES[report.status]}
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-white/25 mr-auto">Actualizado {relativeTime(report.updatedAt, now)}</span>
        <button
          onClick={onGenerate}
          disabled={busy}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          {report.status === 'ready' ? 'Regenerar' : 'Generar'}
        </button>
        <button
          onClick={() => onExport('pdf')}
          disabled={report.status !== 'ready'}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Exportar {REPORT_FORMAT_LABEL_ES.pdf}
        </button>
        <button
          onClick={() => onExport('csv')}
          disabled={report.status !== 'ready'}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Exportar {REPORT_FORMAT_LABEL_ES.csv}
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-rose-500/30 bg-rose-500/[0.08] text-rose-300/85 hover:bg-rose-500/[0.14] transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

function ReportPreviewPanel({
  report,
  agents,
  onClose,
  onGenerate,
  onExport,
}: {
  report: CentralReport;
  agents: Agent[];
  onClose: () => void;
  onGenerate: () => void;
  onExport: (format: ReportFormat) => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="onyx-popover w-full max-w-2xl my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/[0.07]">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.18em] text-violet-300/60 mb-1">Informe</div>
            <h3 className="text-white font-semibold text-lg leading-snug">{report.title}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${REPORT_STATUS_TW[report.status]}`}>
                {REPORT_STATUS_LABEL_ES[report.status]}
              </span>
              <span className="text-[10px] text-white/35">
                {REPORT_PERIOD_LABEL_ES[report.period]} · {agentNames(agents, report.agentIds)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="onyx-icon-button shrink-0 text-white/45 hover:text-white w-8 h-8 transition-colors" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {report.status === 'generating' ? (
            <div className="flex items-center gap-2 text-sm text-white/50 py-8 justify-center">
              <span className="w-4 h-4 rounded-full border-2 border-amber-400/30 border-t-amber-300 animate-spin" />
              Generando informe...
            </div>
          ) : report.status === 'failed' ? (
            <div className="text-center py-6">
              <p className="text-sm text-rose-300/80">{report.failureReason ?? 'No se pudo generar el informe.'}</p>
            </div>
          ) : !report.content ? (
            <div className="text-sm text-white/30 text-center py-8">Todavía no se ha generado este informe.</div>
          ) : (
            <>
              {report.content.metrics.length > 0 && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Métricas</div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {report.content.metrics.map((m) => (
                      <div key={m.id}>
                        <div className="text-[10px] text-white/30 uppercase tracking-wide">{m.label}</div>
                        <div className="text-sm text-white/85 font-medium">{formatReportMetricValue(m)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {report.content.sections.map((section) => (
                <div key={section.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">{section.title}</div>
                  {section.rows.length === 0 ? (
                    <p className="text-xs text-white/30">Sin datos para esta sección.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wide text-white/30">
                            {section.columns.map((col) => (
                              <th key={col} className="text-left font-medium pb-1.5 pr-3">
                                {humanizeReportColumn(col)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((row, i) => (
                            <tr key={i} className="border-t border-white/[0.05]">
                              {section.columns.map((col) => (
                                <td key={col} className="py-1.5 pr-3 text-xs text-white/70">
                                  {row[col]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={onGenerate}
              disabled={report.status === 'generating'}
              className="onyx-control text-xs font-medium text-white/80 px-4 py-2 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {report.status === 'ready' ? 'Regenerar' : 'Generar'}
            </button>
            <button
              onClick={() => onExport('pdf')}
              disabled={report.status !== 'ready'}
              className="onyx-control text-xs font-medium text-white/80 px-4 py-2 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Exportar {REPORT_FORMAT_LABEL_ES.pdf}
            </button>
            <button
              onClick={() => onExport('csv')}
              disabled={report.status !== 'ready'}
              className="onyx-control text-xs font-medium text-white/80 px-4 py-2 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Exportar {REPORT_FORMAT_LABEL_ES.csv}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InformesView({ feed, agents, isSuperAdmin }: Props) {
  const { reports, loading, error, lastExportRequest, createReport, generateReport, regenerateReport, deleteReport, exportReport } = feed;
  const [period, setPeriod] = useState<AnalyticsPeriod>('7d');
  const [agentIds, setAgentIds] = useState<AgentId[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const selectedReport = reports.find((r) => r.id === selectedReportId) ?? null;
  // eslint-disable-next-line react-hooks/purity -- "requested X ago" display is meant to reflect wall-clock time at render.
  const now = Date.now();

  const toggleAgent = (agentId: AgentId) => {
    setAgentIds((prev) => (prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]));
  };

  const handleGenerateNew = (kind: ReportKind) => {
    const title = `${REPORT_KIND_LABEL_ES[kind]} · ${REPORT_PERIOD_LABEL_ES[period]}`;
    const id = createReport({ title, kind, period, agentIds });
    if (id) {
      generateReport(id);
      setSelectedReportId(id);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={FileText}
        title="Informes"
        description={isSuperAdmin ? 'Crea y revisa resúmenes de actividad con controles técnicos cuando los necesites.' : 'Obtén un resumen claro de lo que ha ocurrido en tu empresa, listo para revisar o descargar.'}
        meta={<span className="text-[10px] text-white/35">{reports.length} informes</span>}
        guide={{
          title: 'Cómo funciona',
          items: [
            'Elige el tipo de resumen que necesitas y lo generaremos con el periodo seleccionado.',
            'Cada informe conserva una fotografía del momento en que se creó.',
            'Puedes abrirlo para revisarlo y descargarlo cuando esté listo.',
          ],
        }}
      />

      <section className="onyx-report-builder shrink-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-violet-300/60">Crear en un clic</div>
            <h2 className="mt-1 text-sm font-semibold text-white/90">¿Qué quieres revisar?</h2>
            <p className="mt-0.5 text-[11px] text-white/35">Periodo actual: {REPORT_PERIOD_LABEL_ES[period]}</p>
          </div>
          <details className="relative">
            <summary className="onyx-control cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-white/65">Personalizar periodo{isSuperAdmin ? ' y equipo' : ''}</summary>
            <div className="onyx-popover absolute right-0 top-full z-30 mt-2 w-[min(34rem,calc(100vw-2rem))] p-3">
              <div className="mb-1.5 text-[10px] uppercase tracking-wide text-white/30">Periodo</div>
              <div className="flex flex-wrap gap-1.5">
                {PERIODS.map((p) => (
                  <button key={p} onClick={() => setPeriod(p)} className={`rounded-md border px-2.5 py-1.5 text-[11px] ${period === p ? 'border-violet-400/40 bg-violet-500/10 text-violet-200' : 'border-white/10 text-white/45'}`}>{REPORT_PERIOD_LABEL_ES[p]}</button>
                ))}
              </div>
              {isSuperAdmin && (
                <div className="mt-3 border-t border-white/[0.06] pt-3">
                  <div className="mb-1.5 text-[10px] uppercase tracking-wide text-white/30">Equipo incluido</div>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setAgentIds([])} className={`rounded-md border px-2.5 py-1.5 text-[11px] ${agentIds.length === 0 ? 'border-violet-400/40 bg-violet-500/10 text-violet-200' : 'border-white/10 text-white/45'}`}>Todo el equipo</button>
                    {agents.map((agent) => (
                      <button key={agent.id} onClick={() => toggleAgent(agent.id)} className={`rounded-md border px-2.5 py-1.5 text-[11px] ${agentIds.includes(agent.id) ? 'border-violet-400/40 bg-violet-500/10 text-violet-200' : 'border-white/10 text-white/45'}`}>{agent.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {REPORT_KIND_ORDER.map((kind) => (
            <button key={kind} onClick={() => handleGenerateNew(kind)} className="onyx-report-template">
              <span className="onyx-report-template__icon"><FileText size={15} /></span>
              <span className="min-w-0 text-left">
                <span className="block text-[12px] font-semibold text-white/82">{REPORT_KIND_LABEL_ES[kind]}</span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-white/35">{REPORT_KIND_DESCRIPTION_ES[kind]}</span>
              </span>
              <span className="text-violet-300/55">→</span>
            </button>
          ))}
        </div>
      </section>

      {lastExportRequest && (
        <div className="px-6 py-2 border-b border-white/[0.06] shrink-0 text-[11px] text-emerald-300/70">
          Exportación solicitada: {lastExportRequest.filename} · {relativeTime(lastExportRequest.requestedAt, now)}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="space-y-2 max-w-3xl">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-rose-300/70 text-center mt-12">{error}</div>
        ) : reports.length === 0 ? (
          <div className="text-sm text-white/30 text-center mt-12">
            Todavía no se ha generado ningún informe. Usa &ldquo;+ Generar informe&rdquo; para crear el primero.
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {reports.map((report) => (
              <ReportRow
                key={report.id}
                report={report}
                agents={agents}
                selected={report.id === selectedReportId}
                onSelect={() => setSelectedReportId(report.id)}
                onGenerate={() => (report.status === 'ready' ? regenerateReport(report.id) : generateReport(report.id))}
                onDelete={() => deleteReport(report.id)}
                onExport={(format) => exportReport(report.id, format)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedReport && (
        <ReportPreviewPanel
          report={selectedReport}
          agents={agents}
          onClose={() => setSelectedReportId(null)}
          onGenerate={() => (selectedReport.status === 'ready' ? regenerateReport(selectedReport.id) : generateReport(selectedReport.id))}
          onExport={(format) => exportReport(selectedReport.id, format)}
        />
      )}
    </div>
  );
}
