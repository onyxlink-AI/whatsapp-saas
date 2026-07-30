import { useEffect, useMemo, useState } from 'react';
import { Repeat2 } from 'lucide-react';
import type { AgentId } from '../../schemas';
import type { Routine, RoutineDraft, RoutineFeed, RoutineFrequency, RoutineStatus } from '../hooks/useRoutineFeed';
import { EMPTY_ROUTINE_DRAFT, routineOccursOnDate, selectNextRun } from '../hooks/useRoutineFeed';
import { relativeTime, untilTime } from '../lib/relativeTime';
import {
  MONTH_LABEL_ES,
  ROUTINE_FREQUENCY_LABEL_ES,
  ROUTINE_HISTORY_ACTION_LABEL_ES,
  ROUTINE_STATUS_LABEL_ES,
  ROUTINE_STATUS_TW,
  WEEKDAY_LABEL_ES,
  WEEKDAY_SHORT_ES,
} from '../lib/routineStyles';
import type { Agent } from '../types';
import ViewHeader from './ui/ViewHeader';

type Props = {
  feed: RoutineFeed;
  agents: Agent[];
  openRoutineId?: string | null;
  openRequestId?: number;
};

function agentName(agents: Agent[], agentId: AgentId | null): string {
  if (!agentId) return 'Sin asignar';
  return agents.find((a) => a.id === agentId)?.name ?? agentId;
}

function scheduleDescription(routine: Routine): string {
  if (routine.frequency === 'once') {
    return routine.scheduledAt ? new Date(routine.scheduledAt).toLocaleString('es') : 'Sin fecha';
  }
  if (routine.frequency === 'daily') return `Todos los días a las ${routine.time}`;
  if (routine.frequency === 'monthly') return `El día ${routine.dayOfMonth ?? 1} de cada mes a las ${routine.time}`;
  return `Cada ${WEEKDAY_LABEL_ES[routine.weekday ?? 1].toLocaleLowerCase('es')} a las ${routine.time}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function MonthCalendar({
  routines,
  monthDate,
  selectedDate,
  onSelectDay,
}: {
  routines: Routine[];
  monthDate: Date;
  selectedDate: Date | null;
  onSelectDay: (date: Date) => void;
}) {
  const today = new Date();
  const cells = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i += 1) result.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) result.push(new Date(year, month, d));
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [monthDate]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_SHORT_ES.map((d, i) => (
          <div key={i} className="text-[10px] text-white/30 text-center py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const matches = routines.filter((r) => routineOccursOnDate(r, date));
          const isToday = sameDay(date, today);
          const isSelected = selectedDate && sameDay(date, selectedDate);
          return (
            <button
              key={i}
              onClick={() => onSelectDay(date)}
              className={`aspect-square rounded-md border p-1.5 text-left flex flex-col transition-colors ${
                isSelected
                  ? 'border-[#8AD3D2]/50 bg-[#83CFCE]/[0.12]'
                  : isToday
                    ? 'border-[#8AD3D2]/25 bg-[#83CFCE]/[0.05]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.045]'
              }`}
            >
              <span className={`text-[11px] ${isToday ? 'text-[#A0DCDB] font-semibold' : 'text-white/55'}`}>{date.getDate()}</span>
              {matches.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-auto">
                  {matches.slice(0, 3).map((r) => (
                    <span key={r.id} className="w-1.5 h-1.5 rounded-full bg-[#8AD3D2]" title={r.name} />
                  ))}
                  {matches.length > 3 && <span className="text-[9px] text-white/30">+{matches.length - 3}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RoutineActions({ routine, feed }: { routine: Routine; feed: RoutineFeed }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {routine.status === 'active' && (
        <button
          onClick={() => feed.runRoutineNow(routine.id)}
          className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-[#8AD3D2]/25 bg-[#83CFCE]/[0.08] text-[#BFE7E6] hover:bg-[#83CFCE]/[0.14] transition-colors"
        >
          Ejecutar ahora
        </button>
      )}
      <button
        onClick={() => feed.toggleRoutineStatus(routine.id)}
        className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
      >
        {routine.status === 'active' ? 'Pausar' : 'Activar'}
      </button>
      <button
        onClick={() => feed.deleteRoutine(routine.id)}
        className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/[0.08] text-rose-300/85 hover:bg-rose-500/[0.14] transition-colors"
      >
        Eliminar
      </button>
    </div>
  );
}

function RoutineDetailModal({ routine, agents, feed, onClose, onEdit }: { routine: Routine; agents: Agent[]; feed: RoutineFeed; onClose: () => void; onEdit: () => void }) {
  // eslint-disable-next-line react-hooks/purity -- relative "next run" display is meant to reflect wall-clock time at render.
  const now = Date.now();
  const nextRun = selectNextRun(routine);

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="onyx-popover w-full max-w-xl my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/[0.07]">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.18em] text-[#A0DCDB]/60 mb-1">Rutina</div>
            <h3 className="text-white font-semibold text-lg leading-snug">{routine.name}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${ROUTINE_STATUS_TW[routine.status]}`}>
                {ROUTINE_STATUS_LABEL_ES[routine.status]}
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-white/45 border-white/10 bg-white/[0.03]">
                {ROUTINE_FREQUENCY_LABEL_ES[routine.frequency]}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="onyx-icon-button shrink-0 text-white/45 hover:text-white w-8 h-8 transition-colors" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {routine.description && <p className="text-sm text-white/75 leading-relaxed">{routine.description}</p>}

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Programación</div>
              <div className="text-xs text-white/80">{scheduleDescription(routine)}</div>
            </div>
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Próxima ejecución</div>
              <div className="text-xs text-white/80">{nextRun ? nextRun.toLocaleString('es') : 'Sin próxima ejecución'}</div>
            </div>
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Agente responsable</div>
              <div className="text-xs text-white/80">{agentName(agents, routine.targetAgentId)}</div>
            </div>
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Última ejecución</div>
              <div className="text-xs text-white/80">{routine.lastRunAt ? relativeTime(routine.lastRunAt, now) : 'Nunca'}</div>
            </div>
          </div>

          <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
            <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Tarea que crea al ejecutarse</div>
            <div className="text-xs text-white/80">{routine.taskTitle}</div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Acciones</div>
            <RoutineActions routine={routine} feed={feed} />
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Historial</div>
            <ul className="space-y-1.5">
              {[...routine.history].reverse().map((entry) => (
                <li key={entry.id} className="text-xs text-white/60 flex items-center gap-1.5">
                  <span className="text-white/80">{ROUTINE_HISTORY_ACTION_LABEL_ES[entry.action]}</span>
                  {entry.note && <span className="text-white/35 truncate">· {entry.note}</span>}
                  <span className="text-white/25 ml-auto shrink-0">{relativeTime(entry.occurredAt, now)}</span>
                </li>
              ))}
            </ul>
          </div>

          <button onClick={onEdit} className="onyx-control text-xs font-medium text-white/80 px-4 py-2 transition-colors">
            Editar rutina
          </button>
        </div>
      </div>
    </div>
  );
}

function RoutineFormModal({
  initial,
  agents,
  onCancel,
  onSubmit,
}: {
  initial: RoutineDraft;
  agents: Agent[];
  onCancel: () => void;
  onSubmit: (draft: RoutineDraft) => void;
}) {
  const [draft, setDraft] = useState<RoutineDraft>(initial);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!draft.name.trim()) return setError('El nombre es obligatorio.');
    if (!draft.taskTitle.trim()) return setError('Indica qué tarea debe crear al ejecutarse.');
    if (!draft.targetAgentId) return setError('Selecciona un agente responsable.');
    if (draft.frequency === 'once' && !draft.scheduledAt) return setError('Elige fecha y hora para una rutina única.');
    if (draft.frequency === 'once' && new Date(draft.scheduledAt!).getTime() <= Date.now()) {
      return setError('La fecha de una rutina única debe estar en el futuro.');
    }
    setError(null);
    onSubmit(draft);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" onClick={onCancel}>
      <div className="onyx-popover w-full max-w-lg my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/[0.07]">
          <h3 className="text-white font-semibold">{initial.name ? 'Editar rutina' : 'Nueva rutina'}</h3>
          <button onClick={onCancel} className="onyx-icon-button shrink-0 text-white/45 hover:text-white w-8 h-8 transition-colors" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/30">Nombre</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/30">Descripción</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              className="onyx-input w-full min-h-20 max-h-56 rounded-md px-3 py-2 text-xs mt-1 resize-y"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/30 mb-1.5 block">Frecuencia</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ROUTINE_FREQUENCY_LABEL_ES) as RoutineFrequency[]).map((freq) => (
                <button
                  key={freq}
                  onClick={() => setDraft({ ...draft, frequency: freq })}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    draft.frequency === freq ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/10 text-[#BFE7E6]' : 'border-white/10 text-white/40 hover:text-white/65'
                  }`}
                >
                  {ROUTINE_FREQUENCY_LABEL_ES[freq]}
                </button>
              ))}
            </div>
          </div>

          {draft.frequency === 'once' ? (
            <div>
              <label className="text-[10px] uppercase tracking-wide text-white/30">Fecha y hora</label>
              <input
                type="datetime-local"
                value={draft.scheduledAt ? draft.scheduledAt.slice(0, 16) : ''}
                onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
              />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {draft.frequency === 'weekly' && (
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-white/30">Día de la semana</label>
                  <select
                    value={draft.weekday ?? 1}
                    onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}
                    className="onyx-input w-full rounded-md px-2 py-2 text-xs mt-1"
                  >
                    {WEEKDAY_LABEL_ES.map((label, i) => (
                      <option key={i} value={i}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {draft.frequency === 'monthly' && (
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-white/30">Día del mes</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={draft.dayOfMonth ?? 1}
                    onChange={(e) => setDraft({ ...draft, dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value))) })}
                    className="onyx-input w-full rounded-md px-2 py-2 text-xs mt-1"
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] uppercase tracking-wide text-white/30">Hora</label>
                <input
                  type="time"
                  value={draft.time}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                  className="onyx-input w-full rounded-md px-2 py-2 text-xs mt-1"
                />
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-white/30">Agente responsable</label>
              <select
                value={draft.targetAgentId ?? ''}
                onChange={(e) => setDraft({ ...draft, targetAgentId: (e.target.value || null) as AgentId | null })}
                className="onyx-input w-full rounded-md px-2 py-2 text-xs mt-1"
              >
                <option value="">Selecciona un agente</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-white/30">Tarea a crear</label>
              <input
                value={draft.taskTitle}
                onChange={(e) => setDraft({ ...draft, taskTitle: e.target.value })}
                placeholder="Título de la tarea..."
                className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
              />
            </div>
          </div>

          {error && <p className="text-[11px] text-rose-300/80">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={onCancel} className="onyx-control text-xs font-medium text-white/70 px-4 py-2 transition-colors">
              Cancelar
            </button>
            <button
              onClick={submit}
              className="bg-[#79CBCA] hover:bg-[#83CFCE] text-[#102828] rounded-md px-4 py-2 text-xs font-semibold transition-colors border border-[#8AD3D2]/25"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RutinasView({ feed, agents, openRoutineId, openRequestId }: Props) {
  const { routines, filteredRoutines, filters, setFilters, resetFilters, createRoutine, updateRoutine } = feed;
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);

  const selectedRoutine = routines.find((r) => r.id === selectedRoutineId) ?? null;
  const dayRoutines = selectedDate ? filteredRoutines.filter((r) => routineOccursOnDate(r, selectedDate)) : [];
  // eslint-disable-next-line react-hooks/purity -- "time until next run" is meant to reflect wall-clock time at render.
  const now = Date.now();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a routine from global search is an external navigation signal (openRequestId), not derivable state.
    if (openRoutineId) setSelectedRoutineId(openRoutineId);
  }, [openRequestId, openRoutineId]);

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <ViewHeader
        icon={Repeat2}
        eyebrow="Oficina Virtual · Workspace demo"
        title="Rutinas"
        description="Programa trabajo recurrente con responsable, frecuencia y próxima ejecución siempre visibles."
        meta={<span className="text-[10px] text-white/35">{routines.length} rutinas · {routines.filter((r) => r.status === 'active').length} activas</span>}
        guide={{
          title: 'Antes de activar una rutina',
          items: [
            'Verifica responsable, frecuencia, zona horaria y próxima ejecución.',
            'Mantén pausada cualquier rutina que todavía no tenga instrucciones completas.',
            'Consulta el historial para confirmar ejecuciones y detectar fallos repetidos.',
          ],
        }}
      />

      <div className="px-6 pt-3 pb-2 border-b border-white/[0.06] shrink-0 flex flex-wrap items-center gap-2">
        <input
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          placeholder="Buscar rutinas..."
          className="onyx-input rounded-md px-3 py-1.5 text-xs w-full max-w-[200px]"
        />
        <select
          value={filters.agentId}
          onChange={(e) => setFilters({ agentId: (e.target.value || 'all') as AgentId | 'all' })}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
        >
          <option value="all">Todos los agentes</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={filters.frequency}
          onChange={(e) => setFilters({ frequency: e.target.value as RoutineFrequency | 'all' })}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
        >
          <option value="all">Toda frecuencia</option>
          {(Object.keys(ROUTINE_FREQUENCY_LABEL_ES) as RoutineFrequency[]).map((f) => (
            <option key={f} value={f}>
              {ROUTINE_FREQUENCY_LABEL_ES[f]}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value as RoutineStatus | 'all' })}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
        >
          <option value="all">Todo estado</option>
          {(Object.keys(ROUTINE_STATUS_LABEL_ES) as RoutineStatus[]).map((s) => (
            <option key={s} value={s}>
              {ROUTINE_STATUS_LABEL_ES[s]}
            </option>
          ))}
        </select>
        <button onClick={resetFilters} className="onyx-control text-[11px] font-medium text-white/60 px-2.5 py-1.5 transition-colors">
          Limpiar
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-white/10 overflow-hidden">
            <button
              onClick={() => setViewMode('calendar')}
              className={`text-[11px] px-2.5 py-1.5 transition-colors ${viewMode === 'calendar' ? 'bg-[#83CFCE]/15 text-[#BFE7E6]' : 'text-white/45 hover:text-white/70'}`}
            >
              Calendario
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`text-[11px] px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-[#83CFCE]/15 text-[#BFE7E6]' : 'text-white/45 hover:text-white/70'}`}
            >
              Lista
            </button>
          </div>
          <button
            onClick={() => setFormMode('create')}
            className="bg-[#79CBCA] hover:bg-[#83CFCE] text-[#102828] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors border border-[#8AD3D2]/25 whitespace-nowrap"
          >
            + Nueva rutina
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
        {filteredRoutines.length === 0 ? (
          <div className="text-sm text-white/30 text-center mt-12">
            {routines.length === 0 ? 'Todavía no hay rutinas. Crea la primera con "+ Nueva rutina".' : 'Sin rutinas que coincidan con estos filtros.'}
          </div>
        ) : viewMode === 'calendar' ? (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-4 max-w-4xl">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
                  className="onyx-control text-xs px-2 py-1 transition-colors"
                >
                  ←
                </button>
                <div className="text-sm text-white/80 font-medium">
                  {MONTH_LABEL_ES[monthDate.getMonth()]} {monthDate.getFullYear()}
                </div>
                <button
                  onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
                  className="onyx-control text-xs px-2 py-1 transition-colors"
                >
                  →
                </button>
              </div>
              <MonthCalendar routines={filteredRoutines} monthDate={monthDate} selectedDate={selectedDate} onSelectDay={setSelectedDate} />
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
                  {selectedDate ? selectedDate.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Selecciona un día'}
                </div>
                {selectedDate && dayRoutines.length === 0 && <p className="text-xs text-white/30">Sin rutinas ese día.</p>}
                <ul className="space-y-1.5">
                  {dayRoutines.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => setSelectedRoutineId(r.id)} className="w-full text-left text-xs text-white/75 hover:text-white transition-colors">
                        {r.time} · {r.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Próximas ejecuciones</div>
                <ul className="space-y-1.5">
                  {filteredRoutines
                    .map((r) => ({ r, next: selectNextRun(r) }))
                    .filter((x): x is { r: Routine; next: Date } => x.next !== null)
                    .sort((a, b) => a.next.getTime() - b.next.getTime())
                    .slice(0, 6)
                    .map(({ r, next }) => (
                      <li key={r.id}>
                        <button onClick={() => setSelectedRoutineId(r.id)} className="w-full text-left flex items-center justify-between gap-2 text-xs text-white/70 hover:text-white transition-colors">
                          <span className="truncate">{r.name}</span>
                          <span className="text-white/30 shrink-0">{untilTime(next.toISOString(), now)}</span>
                        </button>
                      </li>
                    ))}
                  {filteredRoutines.every((r) => selectNextRun(r) === null) && <p className="text-xs text-white/30">Sin próximas ejecuciones.</p>}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 max-w-3xl">
            {filteredRoutines.map((routine) => {
              const next = selectNextRun(routine);
              return (
                <button
                  key={routine.id}
                  onClick={() => setSelectedRoutineId(routine.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.035] transition-colors flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white/90 truncate">{routine.name}</div>
                    <div className="text-[11px] text-white/35 truncate">
                      {scheduleDescription(routine)} · {agentName(agents, routine.targetAgentId)}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${ROUTINE_STATUS_TW[routine.status]}`}>
                    {ROUTINE_STATUS_LABEL_ES[routine.status]}
                  </span>
                  <span className="shrink-0 text-[10px] text-white/25 hidden sm:inline w-28 text-right">
                    {next ? untilTime(next.toISOString(), now) : 'Sin próxima'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedRoutine && (
        <RoutineDetailModal
          routine={selectedRoutine}
          agents={agents}
          feed={feed}
          onClose={() => setSelectedRoutineId(null)}
          onEdit={() => setFormMode('edit')}
        />
      )}

      {formMode === 'create' && (
        <RoutineFormModal
          initial={EMPTY_ROUTINE_DRAFT}
          agents={agents}
          onCancel={() => setFormMode(null)}
          onSubmit={(draft) => {
            const id = createRoutine(draft);
            setFormMode(null);
            if (id) setSelectedRoutineId(id);
          }}
        />
      )}

      {formMode === 'edit' && selectedRoutine && (
        <RoutineFormModal
          initial={{
            name: selectedRoutine.name,
            description: selectedRoutine.description,
            frequency: selectedRoutine.frequency,
            time: selectedRoutine.time,
            weekday: selectedRoutine.weekday,
            dayOfMonth: selectedRoutine.dayOfMonth,
            scheduledAt: selectedRoutine.scheduledAt,
            targetAgentId: selectedRoutine.targetAgentId,
            taskTitle: selectedRoutine.taskTitle,
          }}
          agents={agents}
          onCancel={() => setFormMode(null)}
          onSubmit={(draft) => {
            updateRoutine(selectedRoutine.id, draft);
            setFormMode(null);
          }}
        />
      )}
    </div>
  );
}
