import { useEffect, useState } from 'react';
import { ListTodo } from 'lucide-react';
import type { AgentId } from '../../schemas';
import type { Contact360, ContactChannel } from '../central-contacts/types';
import type { Task, TaskDraft, TaskFeed, TaskPriority, TaskStatus } from '../hooks/useTaskFeed';
import { EMPTY_DRAFT, TASK_TRANSITIONS } from '../hooks/useTaskFeed';
import { relativeTime } from '../lib/relativeTime';
import {
  TASK_BOARD_COLUMNS,
  TASK_HISTORY_ACTION_LABEL_ES,
  TASK_PRIORITY_LABEL_ES,
  TASK_PRIORITY_TW,
  TASK_STATUS_LABEL_ES,
  TASK_STATUS_TW,
} from '../lib/taskStyles';
import type { Agent } from '../types';
import ViewHeader from './ui/ViewHeader';

type Props = {
  feed: TaskFeed;
  agents: Agent[];
  contacts: Contact360[];
  onOpenContact360: (contactId: string) => void;
  openTaskId?: string | null;
  openRequestId?: number;
};

const CHANNEL_LABEL_ES: Record<ContactChannel, string> = { whatsapp: 'WhatsApp', voice: 'Voz' };

function agentName(agents: Agent[], agentId: AgentId | null): string {
  if (!agentId) return 'Sin asignar';
  return agents.find((a) => a.id === agentId)?.name ?? agentId;
}

function contactName(contacts: Contact360[], contactId: string | null): string | null {
  if (!contactId) return null;
  return contacts.find((c) => c.contactId === contactId)?.displayName ?? contactId;
}

function ActionButton({
  label,
  tone = 'default',
  onClick,
}: {
  label: string;
  tone?: 'default' | 'emerald' | 'rose';
  onClick: () => void;
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300/85 hover:bg-emerald-500/[0.14]'
      : tone === 'rose'
        ? 'border-rose-500/30 bg-rose-500/[0.08] text-rose-300/85 hover:bg-rose-500/[0.14]'
        : 'border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06]';
  return (
    <button onClick={onClick} className={`text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition-colors ${toneClass}`}>
      {label}
    </button>
  );
}

function TaskCard({ task, agents, contacts, onOpen }: { task: Task; agents: Agent[]; contacts: Contact360[]; onOpen: () => void }) {
  const related = contactName(contacts, task.contactId);
  // eslint-disable-next-line react-hooks/purity -- relative due/updated time is meant to reflect wall-clock time at render.
  const now = Date.now();
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.035] p-3 transition-colors flex flex-col gap-1.5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-white/90 leading-snug">{task.title}</span>
        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${TASK_PRIORITY_TW[task.priority]}`}>
          {TASK_PRIORITY_LABEL_ES[task.priority]}
        </span>
      </div>
      <div className="text-[11px] text-white/40">{agentName(agents, task.responsibleAgentId)}</div>
      {related && <div className="text-[11px] text-white/30">Contacto: {related}</div>}
      <div className="flex items-center justify-between text-[10px] text-white/25 mt-1">
        <span>{task.dueAt ? `Vence ${relativeTime(task.dueAt, now)}` : 'Sin fecha límite'}</span>
        <span>{relativeTime(task.updatedAt, now)}</span>
      </div>
    </button>
  );
}

function TaskRow({ task, agents, contacts, onOpen }: { task: Task; agents: Agent[]; contacts: Contact360[]; onOpen: () => void }) {
  const related = contactName(contacts, task.contactId);
  // eslint-disable-next-line react-hooks/purity -- relative due time is meant to reflect wall-clock time at render.
  const now = Date.now();
  return (
    <button
      onClick={onOpen}
      className="w-full text-left px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.035] transition-colors flex items-center gap-3"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white/90 truncate">{task.title}</div>
        <div className="text-[11px] text-white/35 truncate">
          {agentName(agents, task.responsibleAgentId)}
          {related && ` · ${related}`}
          {task.channel && ` · ${CHANNEL_LABEL_ES[task.channel]}`}
        </div>
      </div>
      <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${TASK_PRIORITY_TW[task.priority]}`}>
        {TASK_PRIORITY_LABEL_ES[task.priority]}
      </span>
      <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${TASK_STATUS_TW[task.status]}`}>
        {TASK_STATUS_LABEL_ES[task.status]}
      </span>
      <span className="shrink-0 text-[10px] text-white/25 hidden sm:inline w-20 text-right">
        {task.dueAt ? relativeTime(task.dueAt, now) : '—'}
      </span>
    </button>
  );
}

function TaskActions({ task, feed, agents }: { task: Task; feed: TaskFeed; agents: Agent[] }) {
  const actions = TASK_TRANSITIONS[task.status];
  if (actions.length === 0) {
    return <p className="text-[11px] text-white/30">Esta tarea ya está en un estado final.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.includes('assign') && (
        <select
          value=""
          onChange={(e) => e.target.value && feed.assignTask(task.id, e.target.value as AgentId)}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
        >
          <option value="">Asignar a...</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      {actions.includes('start') && <ActionButton label="Iniciar" onClick={() => feed.startTask(task.id)} />}
      {actions.includes('request_approval') && (
        <ActionButton label="Solicitar aprobación" onClick={() => feed.requestApproval(task.id)} />
      )}
      {actions.includes('approve') && <ActionButton label="Aprobar" tone="emerald" onClick={() => feed.approveTask(task.id)} />}
      {actions.includes('reject') && <ActionButton label="Rechazar" tone="rose" onClick={() => feed.rejectTask(task.id)} />}
      {actions.includes('resume') && <ActionButton label="Reanudar" onClick={() => feed.resumeTask(task.id)} />}
      {actions.includes('complete') && <ActionButton label="Completar" tone="emerald" onClick={() => feed.completeTask(task.id)} />}
      {actions.includes('block') && <ActionButton label="Bloquear" onClick={() => feed.blockTask(task.id)} />}
      {actions.includes('cancel') && <ActionButton label="Cancelar" tone="rose" onClick={() => feed.cancelTask(task.id)} />}
    </div>
  );
}

function TaskDetailModal({
  task,
  agents,
  contacts,
  feed,
  onClose,
  onEdit,
  onOpenContact360,
}: {
  task: Task;
  agents: Agent[];
  contacts: Contact360[];
  feed: TaskFeed;
  onClose: () => void;
  onEdit: () => void;
  onOpenContact360: (contactId: string) => void;
}) {
  // eslint-disable-next-line react-hooks/purity -- relative due/updated time is meant to reflect wall-clock time at render.
  const now = Date.now();
  const related = task.contactId ? contacts.find((c) => c.contactId === task.contactId) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="onyx-popover w-full max-w-xl my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/[0.07]">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.18em] text-violet-300/60 mb-1">Tarea</div>
            <h3 className="text-white font-semibold text-lg leading-snug">{task.title}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${TASK_STATUS_TW[task.status]}`}>
                {TASK_STATUS_LABEL_ES[task.status]}
              </span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${TASK_PRIORITY_TW[task.priority]}`}>
                {TASK_PRIORITY_LABEL_ES[task.priority]}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="onyx-icon-button shrink-0 text-white/45 hover:text-white w-8 h-8 transition-colors" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {task.description && <p className="text-sm text-white/75 leading-relaxed">{task.description}</p>}

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Agente responsable</div>
              <div className="text-xs text-white/80">{agentName(agents, task.responsibleAgentId)}</div>
            </div>
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Vence</div>
              <div className="text-xs text-white/80">{task.dueAt ? new Date(task.dueAt).toLocaleString('es') : 'Sin fecha límite'}</div>
            </div>
          </div>

          {related && (
            <div className="rounded-md bg-white/[0.03] px-3 py-2.5 flex items-center justify-between gap-2">
              <div>
                <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Contacto relacionado</div>
                <div className="text-xs text-white/80">
                  {related.displayName}
                  {task.channel && ` · ${CHANNEL_LABEL_ES[task.channel]}`}
                </div>
              </div>
              <button
                onClick={() => onOpenContact360(related.contactId)}
                className="shrink-0 text-[11px] font-medium text-violet-300/80 hover:text-violet-200 border border-violet-400/25 hover:bg-violet-500/10 rounded-md px-2.5 py-1.5 transition-colors"
              >
                Ver Contacto 360
              </button>
            </div>
          )}

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Acciones</div>
            <TaskActions task={task} feed={feed} agents={agents} />
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Historial</div>
            <ul className="space-y-1.5">
              {[...task.history].reverse().map((entry) => (
                <li key={entry.id} className="text-xs text-white/60 flex items-center gap-1.5">
                  <span className="text-white/80">{TASK_HISTORY_ACTION_LABEL_ES[entry.action]}</span>
                  {entry.note && <span className="text-white/35 truncate">· {entry.note}</span>}
                  <span className="text-white/25 ml-auto shrink-0">{relativeTime(entry.occurredAt, now)}</span>
                </li>
              ))}
            </ul>
          </div>

          <button onClick={onEdit} className="onyx-control text-xs font-medium text-white/80 px-4 py-2 transition-colors">
            Editar tarea
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskFormModal({
  initial,
  agents,
  contacts,
  onCancel,
  onSubmit,
}: {
  initial: TaskDraft;
  agents: Agent[];
  contacts: Contact360[];
  onCancel: () => void;
  onSubmit: (draft: TaskDraft) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(initial);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!draft.title.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    onSubmit(draft);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" onClick={onCancel}>
      <div className="onyx-popover w-full max-w-lg my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/[0.07]">
          <h3 className="text-white font-semibold">{initial.title ? 'Editar tarea' : 'Nueva tarea'}</h3>
          <button onClick={onCancel} className="onyx-icon-button shrink-0 text-white/45 hover:text-white w-8 h-8 transition-colors" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/30">Título</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/30">Descripción</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1 resize-none"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-white/30">Prioridad</label>
              <select
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}
                className="onyx-input w-full rounded-md px-2 py-2 text-xs mt-1"
              >
                {(Object.keys(TASK_PRIORITY_LABEL_ES) as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABEL_ES[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-white/30">Agente responsable</label>
              <select
                value={draft.responsibleAgentId ?? ''}
                onChange={(e) => setDraft({ ...draft, responsibleAgentId: (e.target.value || null) as AgentId | null })}
                className="onyx-input w-full rounded-md px-2 py-2 text-xs mt-1"
              >
                <option value="">Sin asignar</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-white/30">Contacto</label>
              <select
                value={draft.contactId ?? ''}
                onChange={(e) => setDraft({ ...draft, contactId: e.target.value || null })}
                className="onyx-input w-full rounded-md px-2 py-2 text-xs mt-1"
              >
                <option value="">Sin contacto</option>
                {contacts.map((c) => (
                  <option key={c.contactId} value={c.contactId}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-white/30">Canal</label>
              <select
                value={draft.channel ?? ''}
                onChange={(e) => setDraft({ ...draft, channel: (e.target.value || null) as ContactChannel | null })}
                className="onyx-input w-full rounded-md px-2 py-2 text-xs mt-1"
              >
                <option value="">Sin canal</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="voice">Voz</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/30">Fecha límite</label>
            <input
              type="datetime-local"
              value={draft.dueAt ? draft.dueAt.slice(0, 16) : ''}
              onChange={(e) => setDraft({ ...draft, dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="onyx-input w-full rounded-md px-3 py-2 text-xs mt-1"
            />
          </div>

          {error && <p className="text-[11px] text-rose-300/80">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={onCancel} className="onyx-control text-xs font-medium text-white/70 px-4 py-2 transition-colors">
              Cancelar
            </button>
            <button
              onClick={submit}
              className="bg-violet-600 hover:bg-violet-500 text-white rounded-md px-4 py-2 text-xs font-semibold transition-colors border border-violet-400/25"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TareasView({ feed, agents, contacts, onOpenContact360, openTaskId, openRequestId }: Props) {
  const { loading, tasks, filteredTasks, filters, setFilters, resetFilters, createTask, updateTask } = feed;
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);

  const selectedTask = filteredTasks.find((t) => t.id === selectedTaskId) ?? tasks.find((t) => t.id === selectedTaskId) ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a task from global search is an external navigation signal (openRequestId), not derivable state.
    if (openTaskId) setSelectedTaskId(openTaskId);
  }, [openRequestId, openTaskId]);

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={ListTodo}
        eyebrow="Oficina Virtual · Workspace demo"
        title="Tareas"
        description="Organiza el trabajo del equipo, asigna responsables y controla las decisiones que requieren aprobación."
        meta={<span className="text-[10px] text-white/35">{tasks.length} tareas · {tasks.filter((t) => t.status === 'approval_required').length} por aprobar</span>}
        guide={{
          title: 'Flujo de trabajo seguro',
          items: [
            'Toda tarea debe tener un objetivo, una prioridad y un responsable claros.',
            'Las acciones sensibles permanecen detenidas hasta recibir aprobación humana.',
            'Revisa el historial del detalle para entender quién cambió cada estado.',
          ],
        }}
      />

      <div className="px-6 pt-3 pb-2 border-b border-white/[0.06] shrink-0 flex flex-wrap items-center gap-2">
        <input
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          placeholder="Buscar tareas..."
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
          value={filters.priority}
          onChange={(e) => setFilters({ priority: e.target.value as TaskPriority | 'all' })}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
        >
          <option value="all">Toda prioridad</option>
          {(Object.keys(TASK_PRIORITY_LABEL_ES) as TaskPriority[]).map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABEL_ES[p]}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value as TaskStatus | 'all' })}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
        >
          <option value="all">Todos los estados</option>
          {TASK_BOARD_COLUMNS.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABEL_ES[s]}
            </option>
          ))}
        </select>
        <select
          value={filters.channel}
          onChange={(e) => setFilters({ channel: (e.target.value || 'all') as ContactChannel | 'all' })}
          className="onyx-input rounded-md px-2 py-1.5 text-[11px]"
        >
          <option value="all">Todo canal</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="voice">Voz</option>
        </select>
        <button onClick={resetFilters} className="onyx-control text-[11px] font-medium text-white/60 px-2.5 py-1.5 transition-colors">
          Limpiar
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-white/10 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`text-[11px] px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-violet-500/15 text-violet-200' : 'text-white/45 hover:text-white/70'}`}
            >
              Lista
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`text-[11px] px-2.5 py-1.5 transition-colors ${viewMode === 'board' ? 'bg-violet-500/15 text-violet-200' : 'text-white/45 hover:text-white/70'}`}
            >
              Tablero
            </button>
          </div>
          <button
            onClick={() => setFormMode('create')}
            className="bg-violet-600 hover:bg-violet-500 text-white rounded-md px-3 py-1.5 text-xs font-semibold transition-colors border border-violet-400/25 whitespace-nowrap"
          >
            + Nueva tarea
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-sm text-white/30 text-center mt-12">
            {tasks.length === 0 ? 'Todavía no hay tareas. Crea la primera con "+ Nueva tarea".' : 'Sin tareas que coincidan con estos filtros.'}
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-1.5 max-w-3xl">
            {filteredTasks.map((task) => (
              <TaskRow key={task.id} task={task} agents={agents} contacts={contacts} onOpen={() => setSelectedTaskId(task.id)} />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {TASK_BOARD_COLUMNS.map((status) => {
              const columnTasks = filteredTasks.filter((t) => t.status === status);
              return (
                <div key={status} className="w-64 shrink-0 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 px-1">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${TASK_STATUS_TW[status]}`}>
                      {TASK_STATUS_LABEL_ES[status]}
                    </span>
                    <span className="text-[10px] text-white/25">{columnTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} agents={agents} contacts={contacts} onOpen={() => setSelectedTaskId(task.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          agents={agents}
          contacts={contacts}
          feed={feed}
          onClose={() => setSelectedTaskId(null)}
          onEdit={() => setFormMode('edit')}
          onOpenContact360={onOpenContact360}
        />
      )}

      {formMode === 'create' && (
        <TaskFormModal
          initial={EMPTY_DRAFT}
          agents={agents}
          contacts={contacts}
          onCancel={() => setFormMode(null)}
          onSubmit={(draft) => {
            const id = createTask(draft);
            setFormMode(null);
            if (id) setSelectedTaskId(id);
          }}
        />
      )}

      {formMode === 'edit' && selectedTask && (
        <TaskFormModal
          initial={{
            title: selectedTask.title,
            description: selectedTask.description,
            priority: selectedTask.priority,
            responsibleAgentId: selectedTask.responsibleAgentId,
            contactId: selectedTask.contactId,
            channel: selectedTask.channel,
            dueAt: selectedTask.dueAt,
          }}
          agents={agents}
          contacts={contacts}
          onCancel={() => setFormMode(null)}
          onSubmit={(draft) => {
            updateTask(selectedTask.id, draft);
            setFormMode(null);
          }}
        />
      )}
    </div>
  );
}
