export type ContactStage = 'new' | 'engaged' | 'qualified' | 'customer' | 'lost';
export type ConversationState =
  | 'ai_active'
  | 'human_active'
  | 'handoff_pending'
  | 'waiting_reply'
  | 'paused'
  | 'closed';
export type DealStage = 'new' | 'contacted' | 'proposal_sent' | 'negotiation' | 'won' | 'lost';
export type ContactChannel = 'whatsapp' | 'voice';

export type Contact360 = {
  workspaceId: string;
  contactId: string;
  displayName: string;
  phoneMasked: string;
  emailMasked: string | null;
  source: string | null;
  stage: ContactStage;
  tags: string[];
  optIn: boolean;
  channels: ContactChannel[];
  whatsapp: {
    conversationId: string;
    state: ConversationState;
    aiEnabled: boolean;
    unreadCount: number;
    lastMessageAt: string | null;
    windowExpiresAt: string | null;
    lastMessagePreview: string | null;
    lastMessageDirection: 'in' | 'out' | null;
    lastMessageStatus: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  } | null;
  voice: {
    callId: string;
    status: string | null;
    startedAt: string | null;
    durationSeconds: number | null;
    summary: string | null;
    leadStatus: string | null;
    endedReason: string | null;
  } | null;
  memory: {
    summary: string | null;
    interests: string[];
    preferences: Record<string, unknown>;
    objections: string[];
    leadStatus: string | null;
    nextStep: string | null;
    itemCount: number;
  } | null;
  deal: {
    dealId: string;
    title: string;
    stage: DealStage;
    value: number;
    currency: string;
    expectedCloseDate: string | null;
  } | null;
  pendingTasks: number;
  nextAction: string | null;
  attentionReasons: string[];
  latestActivityAt: string;
};

export type Contact360AdapterResult =
  | { success: true; contact: Contact360 }
  | { success: false; error: 'workspace_mismatch' | 'contact_mismatch' };
