import type { Contact360 } from '../central-contacts';
import type {
  InboxMessageItem,
  InboxPriority,
  InboxProjectionResult,
  InboxThreadStatus,
  InboxTimelineItem,
  InboxVoiceCallItem,
} from './types';

export type InboxMessageInput = {
  id: string;
  workspaceId: string;
  conversationId: string;
  direction: 'in' | 'out';
  body: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  occurredAt: string;
};

export type InboxVoiceCallInput = {
  id: string;
  workspaceId: string;
  contactId: string;
  callStatus: string | null;
  durationSeconds: number | null;
  summary: string | null;
  endedReason: string | null;
  occurredAt: string;
};

export type InboxProjectionInput = {
  contact: Contact360;
  messages: InboxMessageInput[];
  voiceCalls: InboxVoiceCallInput[];
};

function threadStatus(contact: Contact360): InboxThreadStatus {
  const state = contact.whatsapp?.state;
  if (state === 'handoff_pending') return 'handoff';
  if (state === 'closed') return 'closed';
  if (state === 'waiting_reply' || state === 'paused') return 'waiting';
  return 'open';
}

function threadPriority(contact: Contact360, timeline: InboxTimelineItem[]): InboxPriority {
  const failedMessage = timeline.some((item) => item.kind === 'message' && item.status === 'failed');
  if (contact.whatsapp?.state === 'handoff_pending' || failedMessage) return 'urgent';
  if (contact.whatsapp?.unreadCount || contact.pendingTasks > 0) return 'high';
  if (contact.stage === 'lost' || contact.whatsapp?.state === 'closed') return 'low';
  return 'normal';
}

function preview(item: InboxTimelineItem | undefined): string | null {
  const value = item?.kind === 'message' ? item.body : item?.summary;
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function uniqueTimeline(items: InboxTimelineItem[]): InboxTimelineItem[] {
  const byId = new Map<string, InboxTimelineItem>();
  for (const item of items) byId.set(`${item.kind}:${item.id}`, item);
  return [...byId.values()].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}

export function projectInboxThread(input: InboxProjectionInput): InboxProjectionResult {
  const { contact } = input;
  if (
    input.messages.some((item) => item.workspaceId !== contact.workspaceId) ||
    input.voiceCalls.some((item) => item.workspaceId !== contact.workspaceId)
  ) {
    return { success: false, error: 'workspace_mismatch' };
  }
  if (input.voiceCalls.some((item) => item.contactId !== contact.contactId)) {
    return { success: false, error: 'contact_mismatch' };
  }
  if (
    input.messages.length > 0 &&
    (!contact.whatsapp ||
      input.messages.some((item) => item.conversationId !== contact.whatsapp?.conversationId))
  ) {
    return { success: false, error: 'conversation_mismatch' };
  }

  const messages: InboxMessageItem[] = input.messages.map((item) => ({
    ...item,
    kind: 'message',
    channel: 'whatsapp',
    contactId: contact.contactId,
  }));
  const voiceCalls: InboxVoiceCallItem[] = input.voiceCalls.map((item) => ({
    ...item,
    kind: 'voice_call',
    channel: 'voice',
  }));
  const timeline = uniqueTimeline([...messages, ...voiceCalls]);
  const latestItem = timeline.at(-1);
  const status = threadStatus(contact);

  return {
    success: true,
    thread: {
      workspaceId: contact.workspaceId,
      contactId: contact.contactId,
      displayName: contact.displayName,
      phoneMasked: contact.phoneMasked,
      stage: contact.stage,
      channels: [...contact.channels],
      status,
      priority: threadPriority(contact, timeline),
      responsibleAgentId:
        status === 'handoff'
          ? 'coordinator'
          : latestItem?.channel === 'voice'
            ? 'strategy'
            : 'lead-intake',
      unreadCount: contact.whatsapp?.unreadCount ?? 0,
      pendingTasks: contact.pendingTasks,
      attentionReasons: [...contact.attentionReasons],
      latestAt: latestItem?.occurredAt ?? contact.latestActivityAt,
      latestPreview: preview(latestItem),
      memorySummary: contact.memory?.summary ?? null,
      nextAction: contact.nextAction,
      timeline,
    },
  };
}
