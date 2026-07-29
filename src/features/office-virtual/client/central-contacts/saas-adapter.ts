import { maskEmail, maskPhone, messagePreview } from './privacy';
import type {
  Contact360,
  Contact360AdapterResult,
  ContactStage,
  ConversationState,
  DealStage,
} from './types';

type ScopedRow = { workspace_id: string; contact_id: string };

export type SaasContactRow = {
  id: string;
  workspace_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  source: string | null;
  stage: ContactStage;
  tags: string[];
  opt_in: boolean;
  updated_at: string;
};

export type SaasConversationRow = ScopedRow & {
  id: string;
  state: ConversationState;
  ai_enabled: boolean;
  unread_count: number;
  last_message_at: string | null;
  window_expires_at: string | null;
};

export type SaasMessageRow = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  direction: 'in' | 'out';
  body: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  created_at: string;
};

export type SaasVoiceCallRow = ScopedRow & {
  id: string;
  status: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  lead_status: string | null;
  ended_reason: string | null;
  created_at: string;
};

export type SaasContactMemoryRow = ScopedRow & {
  summary: string | null;
  interests: string[];
  preferences: Record<string, unknown>;
  objections: string[];
  lead_status: string | null;
  next_step: string | null;
  updated_at: string;
};

export type SaasDealRow = ScopedRow & {
  id: string;
  title: string;
  stage: DealStage;
  value: number;
  currency: string;
  expected_close_date: string | null;
  updated_at: string;
};

export type SaasContact360Input = {
  contact: SaasContactRow;
  conversation: SaasConversationRow | null;
  lastMessage: SaasMessageRow | null;
  lastVoiceCall: SaasVoiceCallRow | null;
  memory: SaasContactMemoryRow | null;
  memoryItemCount: number;
  latestDeal: SaasDealRow | null;
  pendingTasks: number;
};

function rowScopeValid(row: ScopedRow | null, contact: SaasContactRow): Contact360AdapterResult['success'] {
  return row === null || (row.workspace_id === contact.workspace_id && row.contact_id === contact.id);
}

function latestIso(values: (string | null | undefined)[]): string {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? new Date(0).toISOString();
}

export function adaptSaasContact360(input: SaasContact360Input): Contact360AdapterResult {
  const { contact } = input;
  const scopedRows = [input.conversation, input.lastVoiceCall, input.memory, input.latestDeal];
  const workspaceMismatch = scopedRows.some((row) => row !== null && row.workspace_id !== contact.workspace_id);
  if (workspaceMismatch) return { success: false, error: 'workspace_mismatch' };
  if (scopedRows.some((row) => !rowScopeValid(row, contact))) {
    return { success: false, error: 'contact_mismatch' };
  }
  if (input.lastMessage && input.lastMessage.workspace_id !== contact.workspace_id) {
    return { success: false, error: 'workspace_mismatch' };
  }
  if (input.lastMessage && input.lastMessage.conversation_id !== input.conversation?.id) {
    return { success: false, error: 'contact_mismatch' };
  }

  const attentionReasons: string[] = [];
  if (input.conversation?.state === 'handoff_pending') attentionReasons.push('handoff_pending');
  if (input.lastMessage?.status === 'failed') attentionReasons.push('message_failed');
  if (input.pendingTasks > 0) attentionReasons.push('pending_tasks');

  const channels: Contact360['channels'] = [];
  if (input.conversation) channels.push('whatsapp');
  if (input.lastVoiceCall) channels.push('voice');

  const contact360: Contact360 = {
    workspaceId: contact.workspace_id,
    contactId: contact.id,
    displayName: contact.name?.trim() || 'Contacto sin nombre',
    phoneMasked: maskPhone(contact.phone),
    emailMasked: maskEmail(contact.email),
    source: contact.source,
    stage: contact.stage,
    tags: [...contact.tags],
    optIn: contact.opt_in,
    channels,
    whatsapp: input.conversation
      ? {
          conversationId: input.conversation.id,
          state: input.conversation.state,
          aiEnabled: input.conversation.ai_enabled,
          unreadCount: input.conversation.unread_count,
          lastMessageAt: input.conversation.last_message_at,
          windowExpiresAt: input.conversation.window_expires_at,
          lastMessagePreview: messagePreview(input.lastMessage?.body ?? null),
          lastMessageDirection: input.lastMessage?.direction ?? null,
          lastMessageStatus: input.lastMessage?.status ?? null,
        }
      : null,
    voice: input.lastVoiceCall
      ? {
          callId: input.lastVoiceCall.id,
          status: input.lastVoiceCall.status,
          startedAt: input.lastVoiceCall.started_at,
          durationSeconds: input.lastVoiceCall.duration_seconds,
          summary: input.lastVoiceCall.summary,
          leadStatus: input.lastVoiceCall.lead_status,
          endedReason: input.lastVoiceCall.ended_reason,
        }
      : null,
    memory: input.memory
      ? {
          summary: input.memory.summary,
          interests: [...input.memory.interests],
          preferences: { ...input.memory.preferences },
          objections: [...input.memory.objections],
          leadStatus: input.memory.lead_status,
          nextStep: input.memory.next_step,
          itemCount: Math.max(0, input.memoryItemCount),
        }
      : null,
    deal: input.latestDeal
      ? {
          dealId: input.latestDeal.id,
          title: input.latestDeal.title,
          stage: input.latestDeal.stage,
          value: input.latestDeal.value,
          currency: input.latestDeal.currency,
          expectedCloseDate: input.latestDeal.expected_close_date,
        }
      : null,
    pendingTasks: Math.max(0, input.pendingTasks),
    nextAction: input.memory?.next_step ?? null,
    attentionReasons,
    latestActivityAt: latestIso([
      contact.updated_at,
      input.conversation?.last_message_at,
      input.lastMessage?.created_at,
      input.lastVoiceCall?.started_at,
      input.lastVoiceCall?.created_at,
      input.memory?.updated_at,
      input.latestDeal?.updated_at,
    ]),
  };

  return { success: true, contact: contact360 };
}
