import { describe, expect, it } from 'vitest';
import { isOfficeVirtualEnabled } from './access';
import { visibleNavGroups } from './client/components/Sidebar';
import { seedTaskState } from './client/hooks/useTaskFeed';
import { seedRoutineState } from './client/hooks/useRoutineFeed';
import { seedFilesState } from './client/hooks/useFilesFeed';
import { seedInboxThreads } from './client/hooks/useInboxFeed';
import { seedMemoryState } from './client/hooks/useContactMemoryFeed';
import { seedScopedContact } from './client/hooks/workspaceContactFixture';
import { createMockOfficeFeed } from './client/central-events';
import { searchWorkspace } from './client/central-search';
import type { GlobalSearchSources } from './client/central-search';
import { InMemoryMemoryStore } from './memory/in-memory-store';
import { OfficeEngine } from './orchestrator/engine';

// Regression tests for Codex's isolation review: every workspace-scoped
// feed used to seed from a shared 'workspace-demo'/'demo-actor' constant at
// module scope, so two workspaces open in the same browser tab could read
// or resume each other's tasks, routines, files and chat runs. Fixed by
// threading the real workspaceId/actor into every hook (see
// OfficeVirtualApp.tsx) and by remounting OfficeVirtualApp with
// key={workspaceId} in the route page. These tests exercise the pieces that
// don't need a browser: the access predicate, the nav-visibility predicate,
// the per-workspace seed functions, and the per-instance chat engine.

const ADMIN_A = { actorId: 'admin-a@workspace-a.test', role: 'workspace_admin' as const };
const ADMIN_B = { actorId: 'admin-b@workspace-b.test', role: 'workspace_admin' as const };

describe('office_virtual_enabled access gate', () => {
  it('denies access when the flag is missing, false, or null — only true grants it', () => {
    expect(isOfficeVirtualEnabled(undefined)).toBe(false);
    expect(isOfficeVirtualEnabled(null)).toBe(false);
    expect(isOfficeVirtualEnabled({ office_virtual_enabled: null })).toBe(false);
    expect(isOfficeVirtualEnabled({ office_virtual_enabled: false })).toBe(false);
    expect(isOfficeVirtualEnabled({ office_virtual_enabled: true })).toBe(true);
  });
});

describe('Sidebar navigation visibility', () => {
  it('hides Administración (Activación, Configurador, Orquestador) for a normal workspace user', () => {
    const groups = visibleNavGroups(false);
    expect(groups.find((g) => g.label === 'Administración')).toBeUndefined();
    const allItemIds = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(allItemIds).not.toContain('activacion');
    expect(allItemIds).not.toContain('configurador');
    expect(allItemIds).not.toContain('orquestador');
  });

  it('shows Administración for a superadmin', () => {
    const groups = visibleNavGroups(true);
    const adminGroup = groups.find((g) => g.label === 'Administración');
    expect(adminGroup).toBeDefined();
    expect(adminGroup!.items.map((i) => i.id)).toEqual(['activacion', 'configurador', 'orquestador']);
  });
});

describe('workspace-scoped feed seeding (Tareas, Rutinas, Archivos)', () => {
  it('seeds task state tagged with the real workspaceId, never a shared demo id', () => {
    const stateA = seedTaskState('workspace-a', ADMIN_A);
    const stateB = seedTaskState('workspace-b', ADMIN_B);

    expect(stateA.workspaceId).toBe('workspace-a');
    expect(stateB.workspaceId).toBe('workspace-b');
    expect(Object.values(stateA.tasks).every((t) => t.workspaceId === 'workspace-a')).toBe(true);
    expect(Object.values(stateB.tasks).every((t) => t.workspaceId === 'workspace-b')).toBe(true);

    // Same fixture shape (same task ids seeded either way), but each state's
    // copy is independently tagged — remounting with a new workspaceId can
    // never keep workspace-a's data alive under workspace-b's identity.
    const taskIdsA = Object.keys(stateA.tasks).sort();
    const taskIdsB = Object.keys(stateB.tasks).sort();
    expect(taskIdsA).toEqual(taskIdsB);
    expect(taskIdsA.length).toBeGreaterThan(0);
  });

  it('seeds routine state tagged with the real workspaceId, never a shared demo id', () => {
    const stateA = seedRoutineState('workspace-a', ADMIN_A);
    const stateB = seedRoutineState('workspace-b', ADMIN_B);

    expect(stateA.workspaceId).toBe('workspace-a');
    expect(stateB.workspaceId).toBe('workspace-b');
    expect(Object.values(stateA.routines).every((r) => r.workspaceId === 'workspace-a')).toBe(true);
    expect(Object.values(stateB.routines).every((r) => r.workspaceId === 'workspace-b')).toBe(true);
  });

  it('seeds file state tagged with the real workspaceId, never a shared demo id', () => {
    const actorA = { ...ADMIN_A, workspaceId: 'workspace-a' };
    const actorB = { ...ADMIN_B, workspaceId: 'workspace-b' };
    const stateA = seedFilesState('workspace-a', actorA);
    const stateB = seedFilesState('workspace-b', actorB);

    expect(stateA.workspaceId).toBe('workspace-a');
    expect(stateB.workspaceId).toBe('workspace-b');
    expect(Object.values(stateA.documents).every((d) => d.workspaceId === 'workspace-a')).toBe(true);
    expect(Object.values(stateB.documents).every((d) => d.workspaceId === 'workspace-b')).toBe(true);
  });
});

describe('global search sees every feed scoped to the real workspace', () => {
  it('builds Contactos, Bandeja, Tareas, Rutinas, Memoria and Actividad for a real workspace and never gets workspace_mismatch', () => {
    const workspaceId = 'workspace-real-test';
    const actor = { actorId: 'admin@workspace-real-test.test', role: 'workspace_admin' as const, workspaceId };

    const contact = seedScopedContact(workspaceId);
    expect(contact).not.toBeNull();
    expect(contact!.workspaceId).toBe(workspaceId);

    const threads = seedInboxThreads(workspaceId);
    expect(threads.length).toBeGreaterThan(0);
    expect(threads.every((t) => t.workspaceId === workspaceId)).toBe(true);

    const taskState = seedTaskState(workspaceId, actor);
    const tasks = Object.values(taskState.tasks);
    expect(tasks.length).toBeGreaterThan(0);

    const routineState = seedRoutineState(workspaceId, actor);
    const routines = Object.values(routineState.routines);
    expect(routines.length).toBeGreaterThan(0);

    const memoryState = seedMemoryState(workspaceId);
    const memories = Object.values(memoryState.profiles);
    expect(memories.length).toBeGreaterThan(0);
    expect(memories.every((m) => m.workspaceId === workspaceId)).toBe(true);

    const activities = createMockOfficeFeed(workspaceId);
    expect(activities.length).toBeGreaterThan(0);
    expect(activities.every((e) => e.workspaceId === workspaceId)).toBe(true);

    const sources: GlobalSearchSources = {
      contacts: [contact!],
      conversations: threads,
      tasks,
      routines,
      memories,
      activities,
    };

    // Empty query short-circuits before touching any source, so it can't
    // prove the fix — search for something every fixture actually has.
    const response = searchWorkspace(actor, { workspaceId, query: 'lucía' }, sources);
    expect(response.success).toBe(true);
    if (response.success) {
      expect(response.results.length).toBeGreaterThan(0);
    }

    // The real regression: mixing in a single record from another workspace
    // must still be caught, proving workspace_mismatch isn't just vacuously
    // passing because every source array happens to be empty.
    const contaminated: GlobalSearchSources = { ...sources, tasks: [...tasks, { ...tasks[0], workspaceId: 'workspace-other' }] };
    const mismatchResponse = searchWorkspace(actor, { workspaceId, query: 'lucía' }, contaminated);
    expect(mismatchResponse).toEqual({ success: false, error: 'workspace_mismatch' });
  });
});

describe('chat engine isolation between workspaces', () => {
  it('does not let one workspace resume or approve a run started in another', async () => {
    // Mirrors what useAgentChat now does per hook instance: a fresh
    // InMemoryMemoryStore + OfficeEngine each time, instead of the module-
    // level singleton this fixes.
    const engineA = new OfficeEngine(new InMemoryMemoryStore());
    const engineB = new OfficeEngine(new InMemoryMemoryStore());

    const resultA = await engineA.handleAgentMessage('coordinator', 'hola', undefined);
    expect(resultA.runId).toBeTruthy();

    // Workspace B's engine has never seen this run — trying to act on it
    // must fail loudly, not silently resume workspace A's conversation.
    await expect(engineB.decideApproval(resultA.runId, true)).rejects.toThrow(`Unknown run: ${resultA.runId}`);

    // Continuing the SAME run on the engine that actually owns it still works.
    const resultA2 = await engineA.handleAgentMessage('coordinator', 'sigue', resultA.runId);
    expect(resultA2.runId).toBe(resultA.runId);
  });
});
