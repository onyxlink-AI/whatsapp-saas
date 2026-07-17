import type { AgentId } from '../../schemas';
import type { ContactChannel, ContactStage } from '../central-contacts';

export type InboxThreadStatus = 'open' | 'waiting' | 'handoff' | 'closed';
export type InboxPriority = 'urgent' | 'high' | 'normal' | 'low';
export type InboxSort = 'recent' | 'priority';

type InboxTimelineItemBase = {
  id: string;
  workspaceId: string;
  contactId: string;
  channel: ContactChannel;
  occurredAt: string;
};

export type InboxMessageItem = InboxTimelineItemBase & {
  kind: 'message';
  channel: 'whatsapp';
  conversationId: string;
  direction: 'in' | 'out';
  body: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | null;
};

export type InboxVoiceCallItem = InboxTimelineItemBase & {
  kind: 'voice_call';
  channel: 'voice';
  callStatus: string | null;
  durationSeconds: number | null;
  summary: string | null;
  endedReason: string | null;
};

export type InboxTimelineItem = InboxMessageItem | InboxVoiceCallItem;

export type InboxThread = {
  workspaceId: string;
  contactId: string;
  displayName: string;
  phoneMasked: string;
  stage: ContactStage;
  channels: ContactChannel[];
  status: InboxThreadStatus;
  priority: InboxPriority;
  responsibleAgentId: AgentId;
  unreadCount: number;
  pendingTasks: number;
  attentionReasons: string[];
  latestAt: string;
  latestPreview: string | null;
  memorySummary: string | null;
  nextAction: string | null;
  timeline: InboxTimelineItem[];
};

export type InboxProjectionResult =
  | { success: true; thread: InboxThread }
  | {
      success: false;
      error: 'workspace_mismatch' | 'contact_mismatch' | 'conversation_mismatch';
    };

export type InboxFilters = {
  query?: string;
  channel?: ContactChannel;
  status?: InboxThreadStatus;
  priority?: InboxPriority;
  assignedAgentId?: AgentId;
  unreadOnly?: boolean;
  attentionOnly?: boolean;
  sort?: InboxSort;
};

export type InboxStats = {
  total: number;
  open: number;
  waiting: number;
  handoff: number;
  unread: number;
  whatsapp: number;
  voice: number;
};
