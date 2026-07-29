import { useEffect, useState } from 'react';
import { Bell, Box, Building2, Gauge, ListTodo, Map, Menu, Plus, Search, Sparkles, UsersRound, X } from 'lucide-react';
import type { PendingApproval } from '../hooks/useAgentChat';
import type { CameraMode } from '../three/OfficeCanvas';
import type { ViewId } from './Sidebar';

type Props = {
  onSelectAgent: (id: string) => void;
  pendingApproval: PendingApproval | null;
  onNewTask: (text: string) => void;
  activeView: ViewId;
  onSelectView: (view: ViewId) => void;
  activeSeatCount: number;
  viewTitle: string;
  isOfficeView: boolean;
  cameraMode: CameraMode;
  onCameraModeChange: (mode: CameraMode) => void;
  canUsePresentation: boolean;
  onOpenSearch: () => void;
  onOpenMobileMenu: () => void;
};

const PRIMARY_VIEWS = [
  { id: 'oficina', label: 'Oficina', icon: Building2 },
  { id: 'panel', label: 'Resumen', icon: Gauge },
  { id: 'agentes', label: 'Equipo', icon: UsersRound },
  { id: 'tareas', label: 'Tareas', icon: ListTodo },
] as const;

function Backdrop({ onClose }: { onClose: () => void }) {
  return <button className="fixed inset-0 z-30 cursor-default" onClick={onClose} aria-label="Cerrar desplegable" />;
}

export default function TopBar({
  onSelectAgent,
  pendingApproval,
  onNewTask,
  activeView,
  onSelectView,
  activeSeatCount,
  viewTitle,
  isOfficeView,
  cameraMode,
  onCameraModeChange,
  canUsePresentation,
  onOpenSearch,
  onOpenMobileMenu,
}: Props) {
  const [bellOpen, setBellOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState('');
  const closeAll = () => { setBellOpen(false); setTaskOpen(false); };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const submitTask = () => {
    if (!taskDraft.trim()) return;
    onNewTask(taskDraft.trim());
    setTaskDraft('');
    setTaskOpen(false);
  };

  return (
    <header className="onyx-topbar flex items-center justify-between gap-3 px-3 sm:px-5 shrink-0 z-20">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="onyx-icon-button w-9 h-9 flex items-center justify-center text-white/60 hover:text-white shrink-0"
          aria-label="Abrir todas las herramientas de Oficina Virtual"
        >
          <Menu className="w-4 h-4" strokeWidth={1.8} />
        </button>

        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.14em] text-violet-300/55 hidden sm:block">Oficina Virtual</div>
          <h1 className="text-[13px] sm:text-sm font-semibold text-white/90 truncate">{viewTitle}</h1>
        </div>

        <nav className="onyx-primary-nav hidden lg:flex items-center gap-1 ml-3" aria-label="Secciones principales de Oficina Virtual">
          {PRIMARY_VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onSelectView(id)}
              aria-current={activeView === id ? 'page' : undefined}
              className={`onyx-primary-nav__item ${activeView === id ? 'is-active' : ''}`}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {isOfficeView && (
          <div className="onyx-segment hidden xl:flex items-center p-0.5 text-[11px] ml-1" aria-label="Estilo visual de la oficina">
            {canUsePresentation && (
              <button onClick={() => onCameraModeChange('showcase')} aria-pressed={cameraMode === 'showcase'} title="Vista Presentación" className={`h-7 flex items-center gap-1.5 px-2 rounded-[5px] transition-colors ${cameraMode === 'showcase' ? 'bg-violet-600/85 text-white' : 'text-white/38 hover:text-white/75'}`}>
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.8} />
                <span>Presentación</span>
              </button>
            )}
            <button onClick={() => onCameraModeChange('iso')} aria-pressed={cameraMode === 'iso'} title="Volver a la vista operativa original" className={`h-7 flex items-center gap-1.5 px-2 rounded-[5px] transition-colors ${cameraMode === 'iso' ? 'bg-violet-600/85 text-white' : 'text-white/38 hover:text-white/75'}`}>
              <Box className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span>Operativa</span>
            </button>
            <button onClick={() => onCameraModeChange('2d')} aria-pressed={cameraMode === '2d'} title="Vista superior 2D" className={`w-8 h-7 flex items-center justify-center rounded-[5px] transition-colors ${cameraMode === '2d' ? 'bg-violet-600/85 text-white' : 'text-white/38 hover:text-white/75'}`}>
              <Map className="w-3.5 h-3.5" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div className="onyx-team-status hidden sm:flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${activeSeatCount > 0 ? 'bg-emerald-400' : 'bg-white/25'}`} />
          <span>{activeSeatCount > 0 ? `${activeSeatCount} activos` : 'Equipo sin activar'}</span>
        </div>

        <button onClick={onOpenSearch} className="onyx-icon-button w-8 h-8 flex items-center justify-center text-white/55 hover:text-white" aria-label="Buscar" title="Buscar">
          <Search className="w-4 h-4" strokeWidth={1.8} />
        </button>

        <div className="relative">
          <button onClick={() => { const next = !bellOpen; closeAll(); setBellOpen(next); }} className="onyx-icon-button relative w-8 h-8 flex items-center justify-center text-white/55 hover:text-white" aria-label="Notificaciones" aria-expanded={bellOpen}>
            <Bell className="w-4 h-4" strokeWidth={1.8} />
            {pendingApproval && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-400 border-2 border-[#09080b]" />}
          </button>
          {bellOpen && (
            <>
              <Backdrop onClose={() => setBellOpen(false)} />
              <div className="onyx-popover absolute right-0 top-full mt-2 w-[min(19rem,calc(100vw-1.5rem))] z-40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Notificaciones</span>
                  <button onClick={() => setBellOpen(false)} className="text-white/30 hover:text-white/70" aria-label="Cerrar"><X className="w-3.5 h-3.5" /></button>
                </div>
                {pendingApproval ? (
                  <button onClick={() => { onSelectAgent(pendingApproval.agentId); setBellOpen(false); }} className="w-full text-left bg-rose-500/[0.08] border border-rose-500/20 rounded-md p-3 hover:bg-rose-500/[0.12] transition-colors">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-rose-300 mb-1"><ListTodo className="w-3.5 h-3.5" /> Aprobación pendiente</div>
                    <div className="text-[11px] text-white/45 line-clamp-3 whitespace-pre-line">{pendingApproval.description}</div>
                  </button>
                ) : <div className="text-xs text-white/35 py-3 text-center">Todo está al día.</div>}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button onClick={() => { const next = !taskOpen; closeAll(); setTaskOpen(next); }} className="h-8 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-md px-2.5 sm:px-3 text-[11px] font-semibold transition-colors border border-violet-400/25 shadow-[0_5px_18px_rgba(124,58,237,.18)]" aria-expanded={taskOpen}>
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Nueva tarea</span>
          </button>
          {taskOpen && (
            <>
              <Backdrop onClose={() => setTaskOpen(false)} />
              <div className="onyx-popover absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-1.5rem))] z-40 p-3">
                <div className="mb-2">
                  <div className="text-xs font-semibold text-white/85">Crear una tarea</div>
                  <div className="text-[10px] text-white/35 mt-0.5">Describe el resultado que necesitas.</div>
                </div>
                <textarea value={taskDraft} onChange={(event) => setTaskDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submitTask(); }} placeholder="Ej: preparar el seguimiento del nuevo contacto..." rows={4} className="onyx-input w-full rounded-md px-3 py-2.5 text-xs resize-none" autoFocus />
                <div className="flex items-center justify-end gap-2 mt-2.5">
                  <button onClick={() => setTaskOpen(false)} className="px-3 py-2 rounded-md text-[11px] text-white/45 hover:text-white/75">Cancelar</button>
                  <button onClick={submitTask} disabled={!taskDraft.trim()} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-35 text-white rounded-md px-3 py-2 text-[11px] font-semibold transition-colors">Crear tarea</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
