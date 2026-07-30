import { useState } from 'react';
import {
  Activity, BarChart3, Brain, BriefcaseBusiness, Building2, CheckSquare2,
  ChevronRight, ContactRound, FileText, Files, Gauge, Inbox, Menu,
  Plug, Repeat2, Search, Settings2, ShieldCheck,
  Sparkles, UsersRound, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Ported from the Agencia IA prototype (src/components/Sidebar.tsx). Changes
// from the original, both because this now lives inside the real
// whatsapp-saas panel instead of being the whole app:
// - No sign-out button and no client-side superadmin toggle: the panel's
//   shared (main)/layout.tsx header already owns logout, and `isSuperAdmin`
//   here comes from the real `users.is_super_admin` row, not a demo toggle.
// - No fixed-to-viewport mobile bottom bar here (that would collide with the
//   panel's own fixed mobile nav). The mobile "sections" sheet is triggered
//   from OfficeVirtualTopBar instead — see openMobileMenu.
// "Oficina" (the 3D scene) is the first item and the default landing view —
// see OfficeVirtualApp's initial activeView state.

export type ViewId =
  | 'oficina' | 'panel' | 'agentes' | 'contactos' | 'bandeja' | 'tareas'
  | 'actividad' | 'memoria' | 'archivos' | 'rutinas' | 'buscar' | 'analiticas'
  | 'informes' | 'skills' | 'activacion' | 'configurador' | 'orquestador';

type NavItem = { id: ViewId; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[]; adminOnly?: boolean };

const NAV_GROUPS: NavGroup[] = [
  { label: 'Inicio', items: [
    { id: 'oficina', label: 'Oficina', icon: Building2 },
    { id: 'panel', label: 'Panel', icon: Gauge },
    { id: 'actividad', label: 'Actividad', icon: Activity },
  ] },
  { label: 'Operación', items: [
    { id: 'agentes', label: 'Agentes', icon: UsersRound },
    { id: 'contactos', label: 'Contactos', icon: ContactRound },
    { id: 'bandeja', label: 'Bandeja', icon: Inbox },
    { id: 'tareas', label: 'Tareas', icon: CheckSquare2 },
  ] },
  { label: 'Automatización', items: [
    { id: 'rutinas', label: 'Rutinas', icon: Repeat2 },
    { id: 'skills', label: 'Skills', icon: Sparkles },
  ] },
  { label: 'Conocimiento', items: [
    { id: 'memoria', label: 'Memoria', icon: Brain },
    { id: 'archivos', label: 'Archivos', icon: Files },
  ] },
  { label: 'Inteligencia', items: [
    { id: 'buscar', label: 'Buscar', icon: Search },
    { id: 'analiticas', label: 'Analíticas', icon: BarChart3 },
    { id: 'informes', label: 'Informes', icon: FileText },
  ] },
  { label: 'Administración', adminOnly: true, items: [
    { id: 'activacion', label: 'Activación', icon: ShieldCheck },
    { id: 'configurador', label: 'Configurador', icon: Settings2 },
    { id: 'orquestador', label: 'Orquestador', icon: Plug },
  ] },
];

const CLIENT_LABELS: Partial<Record<ViewId, string>> = {
  panel: 'Resumen',
  agentes: 'Equipo',
  contactos: 'Clientes',
  bandeja: 'Conversaciones',
  actividad: 'Qué está pasando',
  memoria: 'Información recordada',
  archivos: 'Documentos',
  skills: 'Habilidades',
  analiticas: 'Resultados',
};

type Props = {
  active: ViewId;
  onSelect: (id: ViewId) => void;
  userEmail: string | null;
  isSuperAdmin: boolean;
  isDemoMode: boolean;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
};

export function visibleNavGroups(isSuperAdmin: boolean, isDemoMode = false): NavGroup[] {
  return NAV_GROUPS
    .filter((group) => !group.adminOnly || isSuperAdmin || isDemoMode)
    .map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        label: isSuperAdmin ? item.label : (CLIENT_LABELS[item.id] ?? item.label),
      })),
    }));
}

function NavButton({ item, active, onSelect, compact = false }: { item: NavItem; active: ViewId; onSelect: (id: ViewId) => void; compact?: boolean }) {
  const selected = item.id === active;
  const ItemIcon = item.icon;
  return (
    <button
      onClick={() => onSelect(item.id)}
      aria-current={selected ? 'page' : undefined}
      className={`onyx-nav-item relative w-full flex items-center gap-3 rounded-md text-left transition-colors ${compact ? 'px-2.5 py-2' : 'px-3 py-2'} ${selected ? 'is-active text-white font-medium' : 'text-white/55 hover:text-white hover:bg-white/[0.04]'}`}
    >
      <ItemIcon className={`w-[17px] h-[17px] shrink-0 ${selected ? 'text-[#A0DCDB]' : 'text-white/45'}`} strokeWidth={1.8} />
      <span className="truncate text-[13px]">{item.label}</span>
      {selected && <ChevronRight className="ml-auto w-3.5 h-3.5 text-[#A0DCDB]/70" strokeWidth={1.8} />}
    </button>
  );
}

export default function Sidebar({ active, onSelect, userEmail, isSuperAdmin, isDemoMode, mobileMenuOpen, onCloseMobileMenu }: Props) {
  const visibleGroups = visibleNavGroups(isSuperAdmin, isDemoMode);
  const visibleItems = visibleGroups.flatMap((group) => group.items);
  const activeItem = visibleItems.find((item) => item.id === active);
  const choose = (id: ViewId) => { onSelect(id); onCloseMobileMenu(); };

  return (
    <>
      <aside className="hidden">
        <div className="onyx-brand px-4 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-md border border-[#8AD3D2]/30 bg-[#83CFCE]/10 flex items-center justify-center shrink-0 shadow-[inset_0_0_18px_rgba(121,203,202,.12)]">
              <BriefcaseBusiness className="w-5 h-5 text-[#A0DCDB]" strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white/95">Oficina Virtual</div>
              <div className="text-[10px] text-white/38 mt-0.5">Central de agentes</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 onyx-sidebar-nav" aria-label="Navegación de Oficina Virtual">
          {visibleGroups.map((group) => (
            <section key={group.label} className="mb-3 last:mb-0">
              <div className="px-3 mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/27">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => <NavButton key={item.id} item={item} active={active} onSelect={onSelect} compact />)}
              </div>
            </section>
          ))}
        </nav>

        <div className="px-3 pb-3 pt-2 border-t border-white/[0.06]">
          <div className="onyx-identity flex items-center gap-3 px-3 py-2.5">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#111015] border border-[#8AD3D2]/40 flex items-center justify-center text-[10px] font-semibold text-white">
                {(userEmail ?? 'OV').slice(0, 2).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#09080b]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-white/85 truncate">{userEmail ?? 'Oficina Virtual'}</div>
              <div className="mt-0.5 text-[10px] text-emerald-400/75">{isSuperAdmin ? 'Superadministración' : 'En línea'}</div>
            </div>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60]">
          <button className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" onClick={onCloseMobileMenu} aria-label="Cerrar menú" />
          <section className="onyx-mobile-sheet absolute inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-h-[min(72dvh,40rem)] flex flex-col md:inset-y-4 md:left-[17rem] md:right-auto md:bottom-4 md:w-[350px] md:max-h-none" aria-label="Todas las secciones de Oficina Virtual">
            <header className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] shrink-0">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#A0DCDB]/60">Navegación</div>
                <div className="text-sm font-semibold text-white mt-0.5">{activeItem?.label ?? 'Todas las secciones'}</div>
              </div>
              <button onClick={onCloseMobileMenu} className="onyx-icon-button w-8 h-8 flex items-center justify-center text-white/60" aria-label="Cerrar menú">
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="overflow-y-auto p-3 grid grid-cols-2 gap-2 onyx-sidebar-nav">
              {visibleGroups.map((group) => (
                <div key={group.label} className="col-span-2">
                  <div className="px-2 pt-1 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">{group.label}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {group.items.map((item) => <NavButton key={item.id} item={item} active={active} onSelect={choose} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export { Menu as MobileMenuIcon };
