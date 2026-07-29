import type { Contact360 } from '../central-contacts';
import type { OfficeActivityEvent } from '../central-events';
import type { InboxThread } from '../central-inbox';
import type { ContactMemoryProfile } from '../central-memory';
import type { CentralRoutine } from '../central-routines';
import type { CentralTask } from '../central-tasks';

export type GlobalSearchCategory = 'contact' | 'conversation' | 'task' | 'routine' | 'memory' | 'activity';
export type GlobalSearchView = 'contactos' | 'bandeja' | 'tareas' | 'rutinas' | 'memoria' | 'actividad';

export type GlobalSearchActor = {
  actorId: string;
  role: 'super_admin' | 'workspace_admin' | 'workspace_member';
  workspaceId: string | null;
};

export type GlobalSearchQuery = {
  workspaceId: string;
  query: string;
  categories?: GlobalSearchCategory[];
  limit?: number;
  includeSensitiveMemory?: boolean;
};

export type GlobalSearchSources = {
  contacts: Contact360[];
  conversations: InboxThread[];
  tasks: CentralTask[];
  routines: CentralRoutine[];
  memories: ContactMemoryProfile[];
  activities: OfficeActivityEvent[];
};

export type GlobalSearchResult = {
  id: string;
  workspaceId: string;
  category: GlobalSearchCategory;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  occurredAt: string | null;
  score: number;
  target: {
    view: GlobalSearchView;
    entityId: string;
    contactId: string | null;
  };
};

export type GlobalSearchResponse =
  | { success: true; results: GlobalSearchResult[]; total: number }
  | { success: false; error: 'unauthorized' | 'workspace_mismatch' };
