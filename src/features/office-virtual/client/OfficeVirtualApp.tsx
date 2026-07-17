'use client';

import { useMemo, useState } from 'react';
import { agents } from './agents';
import ActivacionView from './components/ActivacionView';
import ActividadView from './components/ActividadView';
import AgentesView from './components/AgentesView';
import AnalisisView from './components/AnalisisView';
import ArchivosView from './components/ArchivosView';
import BandejaView from './components/BandejaView';
import BuscarView from './components/BuscarView';
import ChatPanel from './components/ChatPanel';
import Contact360Panel from './components/Contact360Panel';
import ConfiguradorView from './components/ConfiguradorView';
import ContactosView from './components/ContactosView';
import InformesView from './components/InformesView';
import MemoriaView from './components/MemoriaView';
import OfficeSceneBoundary from './components/OfficeSceneBoundary';
import OrquestadorView from './components/OrquestadorView';
import PanelView from './components/PanelView';
import RutinasView from './components/RutinasView';
import SkillsView from './components/SkillsView';
import Sidebar, { type ViewId } from './components/Sidebar';
import TareasView from './components/TareasView';
import TopBar from './components/TopBar';
import type { CameraMode } from './three/OfficeCanvas';
import { useAgentChat } from './hooks/useAgentChat';
import { useAnalyticsFeed } from './hooks/useAnalyticsFeed';
import { useGlobalSearch } from './hooks/useGlobalSearch';
import { resolveContactIdFromEvent, useContact360Feed } from './hooks/useContact360Feed';
import { useContactMemoryFeed } from './hooks/useContactMemoryFeed';
import { useFilesFeed } from './hooks/useFilesFeed';
import { useInboxFeed } from './hooks/useInboxFeed';
import { useOfficeActivation } from './hooks/useOfficeActivation';
import { useOfficeActivityFeed } from './hooks/useOfficeActivityFeed';
import { useOfficeConfigurator } from './hooks/useOfficeConfigurator';
import { useOpenRouterConnectionFeed } from './hooks/useOpenRouterConnectionFeed';
import { useOrchestratorFeed } from './hooks/useOrchestratorFeed';
import { useRoutineFeed } from './hooks/useRoutineFeed';
import { useReportsFeed } from './hooks/useReportsFeed';
import { useSkillsFeed } from './hooks/useSkillsFeed';
import { useTaskFeed } from './hooks/useTaskFeed';
import type { GlobalSearchResult, GlobalSearchSources, GlobalSearchView } from './central-search';
import './office-virtual.css';

// Ported from the Agencia IA prototype's src/App.tsx (OfficeApp). Real
// differences from the standalone prototype, all because this now runs
// inside the whatsapp-saas panel with a real session instead of its own
// mock auth:
// - No AuthProvider/useAuth: `userEmail` and `isSuperAdmin` are real values
//   from the Supabase session and `users.is_super_admin`, passed as props
//   by the server page (src/app/(main)/oficina-virtual/page.tsx).
// - No client-side superadmin toggle — the prototype's toggle was a demo
//   affordance; superadmin status here is authoritative.
// - `workspaceId` is the SaaS's real active workspace id, threaded into
//   every feed hook below (see the "actor" objects) instead of a shared
//   'workspace-demo' constant — required so switching the active workspace
//   can never leak one client's tasks/routines/files/memory into another's.
//   The route page also remounts this whole component with
//   key={workspaceId}, which is what actually resets local state on switch;
//   the real workspaceId/actor threading here is what makes that reset seed
//   the *right* data instead of the demo fixture every time.
// - Sidebar has no fixed mobile bottom nav of its own anymore (would
//   collide with the panel's own fixed bottom nav) — its "all sections"
//   sheet is opened from TopBar's mobile menu button instead.
// - The 3D "Oficina" scene (./three/*, lazy-loaded via OfficeSceneBoundary)
//   is back as the default landing view, matching the original prototype.
//   Character/status posture still comes from useOfficeActivityFeed's
//   snapshots (see officeAgents below), never from the chat "typing" state.
// Nothing else changed: same central-* domain modules, same hooks, same
// views, same agent/model/blocker/config states as the prototype.

type Props = {
  userEmail: string;
  isSuperAdmin: boolean;
  workspaceId: string;
};

const VIEW_TITLES: Record<ViewId, string> = {
  oficina: 'Oficina',
  panel: 'Panel',
  agentes: 'Agentes',
  contactos: 'Contactos',
  bandeja: 'Bandeja',
  tareas: 'Tareas',
  actividad: 'Actividad',
  memoria: 'Memoria',
  archivos: 'Archivos',
  rutinas: 'Rutinas',
  buscar: 'Buscar',
  analiticas: 'Analíticas',
  informes: 'Informes',
  skills: 'Skills',
  activacion: 'Activación',
  configurador: 'Configurador',
  orquestador: 'Orquestador',
};

export default function OfficeVirtualApp({ userEmail, isSuperAdmin, workspaceId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('oficina');
  const [cameraMode, setCameraMode] = useState<CameraMode>('iso');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Same actor identity (real user, real role, real workspace) threaded into
  // every hook below that dispatches commands or seeds per-workspace state —
  // no hook in this tree falls back to a 'workspace-demo'/'demo-actor'
  // constant anymore.
  const workspaceRole = isSuperAdmin ? ('super_admin' as const) : ('workspace_admin' as const);
  const taskActor = { actorId: userEmail, role: workspaceRole };
  const routineActor = { actorId: userEmail, role: workspaceRole };
  const fileActor = { actorId: userEmail, role: workspaceRole, workspaceId };
  const analyticsActor = { actorId: userEmail, role: workspaceRole, workspaceId };
  const skillActor = { actorId: userEmail, role: workspaceRole, workspaceId };
  const searchActor = { actorId: userEmail, role: workspaceRole, workspaceId };
  const reportActor = { actorId: userEmail, role: workspaceRole, workspaceId };

  const { messagesByAgent, sendMessage, decideApproval, typingAgentId, pendingApproval } = useAgentChat();
  const { snapshots: activitySnapshots, recentEvents, state: activityState } = useOfficeActivityFeed(workspaceId);
  const { state: memoryState, forgetItem } = useContactMemoryFeed(workspaceId);
  const { contacts: contact360List, getContact } = useContact360Feed(workspaceId);
  const [contact360Id, setContact360Id] = useState<string | null>(null);
  const inboxFeed = useInboxFeed(workspaceId);
  const taskFeed = useTaskFeed(workspaceId, taskActor);
  const routineFeed = useRoutineFeed(workspaceId, routineActor);
  const skillsFeed = useSkillsFeed(taskFeed.state, workspaceId, skillActor);
  const filesFeed = useFilesFeed(workspaceId, fileActor);
  const searchSources = useMemo<GlobalSearchSources>(() => ({
    contacts: contact360List,
    conversations: inboxFeed.threads,
    tasks: Object.values(taskFeed.state.tasks),
    routines: Object.values(routineFeed.state.routines),
    memories: Object.values(memoryState.profiles),
    activities: recentEvents,
  }), [contact360List, inboxFeed.threads, memoryState.profiles, recentEvents, routineFeed.state.routines, taskFeed.state.tasks]);
  const globalSearch = useGlobalSearch(workspaceId, searchActor, searchSources);
  const [searchOpenTarget, setSearchOpenTarget] = useState<{
    view: GlobalSearchView;
    entityId: string;
    requestId: number;
  } | null>(null);
  const analyticsFeed = useAnalyticsFeed({
    workspaceId,
    actor: analyticsActor,
    events: recentEvents,
    taskState: taskFeed.state,
    routineState: routineFeed.state,
  });
  const reportsFeed = useReportsFeed(workspaceId, reportActor, analyticsFeed.analytics);
  const officeActorRole = isSuperAdmin ? 'onyxlink_super_admin' : 'workspace_admin';
  const officeActivation = useOfficeActivation(userEmail, officeActorRole);
  const whatsappAgentName = agents.find((a) => a.id === 'lead-intake')?.name ?? 'Agente WhatsApp';
  const officeConfigurator = useOfficeConfigurator(workspaceId, userEmail, officeActorRole);
  const orchestratorFeed = useOrchestratorFeed(userEmail, workspaceRole, workspaceId);
  const openRouterConnectionFeed = useOpenRouterConnectionFeed(userEmail, workspaceRole, workspaceId);

  // Visual posture comes from real (simulated, for now) operational events —
  // never from chat "typing" state. See COORDINACION_CLAUDE_CODEX.md.
  const officeAgents = useMemo(
    () =>
      agents.map((agent) => ({
        ...agent,
        status: activitySnapshots[agent.id]?.status ?? agent.status,
      })),
    [activitySnapshots],
  );

  const selectedAgent = useMemo(() => officeAgents.find((a) => a.id === selectedId) ?? null, [officeAgents, selectedId]);

  // selectAgent ("Abrir despacho") walks over to that agent's desk in the 3D
  // office and opens the chat. openChat ("Conversación") only opens the
  // chat — ChatPanel renders off selectedId regardless of activeView, so it
  // never needs to switch the active view.
  const selectAgent = (id: string) => {
    setActiveView('oficina');
    setSelectedId(id);
  };
  const openChat = (id: string) => setSelectedId(id);

  const startNewTask = (text: string) => {
    const leadIntake = agents.find((a) => a.id === 'lead-intake');
    if (!leadIntake) return;
    setActiveView('oficina');
    setSelectedId(leadIntake.id);
    void sendMessage(leadIntake, text);
  };

  const openSearchResult = (result: GlobalSearchResult) => {
    if (result.target.view === 'bandeja') inboxFeed.resetFilters();
    if (result.target.view === 'tareas') taskFeed.resetFilters();
    if (result.target.view === 'rutinas') routineFeed.resetFilters();
    setSearchOpenTarget((previous) => ({
      view: result.target.view,
      entityId: result.target.entityId,
      requestId: (previous?.requestId ?? 0) + 1,
    }));
    setActiveView(result.target.view);
    if (result.category === 'contact' && result.target.contactId) setContact360Id(result.target.contactId);
  };

  return (
    <div className="onyx-app h-full w-full text-slate-100 flex overflow-hidden">
      <Sidebar
        active={activeView}
        onSelect={setActiveView}
        userEmail={userEmail}
        isSuperAdmin={isSuperAdmin}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          agents={officeAgents}
          onSelectAgent={selectAgent}
          pendingApproval={pendingApproval}
          onNewTask={startNewTask}
          viewTitle={VIEW_TITLES[activeView]}
          isOfficeView={activeView === 'oficina'}
          cameraMode={cameraMode}
          onCameraModeChange={setCameraMode}
          onOpenSearch={() => setActiveView('buscar')}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 relative overflow-hidden">
          {activeView === 'oficina' ? (
            <OfficeSceneBoundary
              agents={officeAgents}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onHover={() => {}}
              cameraMode={cameraMode}
            />
          ) : activeView === 'actividad' ? (
            <ActividadView
              events={recentEvents}
              agents={officeAgents}
              onSelectAgent={selectAgent}
              resolveContactId={resolveContactIdFromEvent}
              onOpenContact={setContact360Id}
              highlightedEventId={searchOpenTarget?.view === 'actividad' ? searchOpenTarget.entityId : null}
              openRequestId={searchOpenTarget?.requestId}
            />
          ) : activeView === 'panel' ? (
            <PanelView state={activityState} agents={officeAgents} onSelectAgent={selectAgent} />
          ) : activeView === 'agentes' ? (
            <AgentesView
              agents={officeAgents}
              snapshots={activitySnapshots}
              onOpenOffice={selectAgent}
              onOpenChat={openChat}
              resolveContactId={resolveContactIdFromEvent}
              onOpenContact={setContact360Id}
            />
          ) : activeView === 'contactos' ? (
            <ContactosView contacts={contact360List} onOpenContact={setContact360Id} />
          ) : activeView === 'bandeja' ? (
            <BandejaView
              feed={inboxFeed}
              agents={officeAgents}
              onOpenContact360={setContact360Id}
              openContactId={searchOpenTarget?.view === 'bandeja' ? searchOpenTarget.entityId : null}
              openRequestId={searchOpenTarget?.requestId}
            />
          ) : activeView === 'tareas' ? (
            <TareasView
              feed={taskFeed}
              agents={officeAgents}
              contacts={contact360List}
              onOpenContact360={setContact360Id}
              openTaskId={searchOpenTarget?.view === 'tareas' ? searchOpenTarget.entityId : null}
              openRequestId={searchOpenTarget?.requestId}
            />
          ) : activeView === 'rutinas' ? (
            <RutinasView
              feed={routineFeed}
              agents={officeAgents}
              openRoutineId={searchOpenTarget?.view === 'rutinas' ? searchOpenTarget.entityId : null}
              openRequestId={searchOpenTarget?.requestId}
            />
          ) : activeView === 'archivos' ? (
            <ArchivosView feed={filesFeed} agents={officeAgents} />
          ) : activeView === 'skills' ? (
            <SkillsView feed={skillsFeed} />
          ) : activeView === 'buscar' ? (
            <BuscarView feed={globalSearch} onOpenResult={openSearchResult} />
          ) : activeView === 'analiticas' ? (
            <AnalisisView
              analytics={analyticsFeed.analytics}
              error={analyticsFeed.error}
              period={analyticsFeed.period}
              onPeriodChange={analyticsFeed.setPeriod}
              agents={officeAgents}
            />
          ) : activeView === 'informes' ? (
            <InformesView feed={reportsFeed} agents={officeAgents} />
          ) : activeView === 'memoria' ? (
            <MemoriaView
              state={memoryState}
              onForgetItem={forgetItem}
              openContactId={searchOpenTarget?.view === 'memoria' ? searchOpenTarget.entityId : null}
              openRequestId={searchOpenTarget?.requestId}
            />
          ) : activeView === 'activacion' && isSuperAdmin ? (
            <ActivacionView
              snapshot={officeActivation.snapshot}
              readiness={officeActivation.readiness}
              whatsappBinding={officeActivation.whatsappBinding}
              scenario={officeActivation.scenario}
              onScenarioChange={officeActivation.setScenario}
              lastDecision={officeActivation.lastDecision}
              onActivate={officeActivation.activate}
              onDeactivate={officeActivation.deactivate}
              whatsappAgentName={whatsappAgentName}
            />
          ) : activeView === 'configurador' && isSuperAdmin ? (
            <ConfiguradorView {...officeConfigurator} />
          ) : activeView === 'orquestador' && isSuperAdmin ? (
            <OrquestadorView feed={orchestratorFeed} agents={officeAgents} connectionFeed={openRouterConnectionFeed} />
          ) : (
            <PanelView state={activityState} agents={officeAgents} onSelectAgent={selectAgent} />
          )}
        </main>
      </div>

      <ChatPanel
        agent={selectedAgent}
        messages={selectedAgent ? messagesByAgent[selectedAgent.id] ?? [] : []}
        isTyping={typingAgentId === selectedAgent?.id}
        onClose={() => setSelectedId(null)}
        onSend={(text) => selectedAgent && sendMessage(selectedAgent, text)}
        onDecideApproval={(approved) => selectedAgent && decideApproval(selectedAgent, approved)}
      />

      <Contact360Panel contact={contact360Id ? getContact(contact360Id) : null} onClose={() => setContact360Id(null)} />
    </div>
  );
}
