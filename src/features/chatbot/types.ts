// 💬 Chatbot — a single, simple FAQ-answering bot per workspace. Deliberately
// NOT the "Agente de WhatsApp": no memory, no CRM/pipeline actions, no
// embeddings/RAG, no autonomous behavior. Every inbound question is answered
// independently; nothing here is ever read back as conversational memory.

export const CHATBOT_USE_CASES = ['external_faq', 'internal_faq'] as const;
export type ChatbotUseCase = (typeof CHATBOT_USE_CASES)[number];

export const CHATBOT_PROVIDERS = ['whatsapp', 'telegram'] as const;
export type ChatbotProvider = (typeof CHATBOT_PROVIDERS)[number];

export type ChatbotStatus = 'draft' | 'published';

export type ChatbotFaq = {
  id: string;
  question: string;
  answer: string;
};

/** Editable business configuration. Intentionally has no credential fields. */
export type ChatbotDraft = {
  name: string;
  useCase: ChatbotUseCase;
  purpose: string;
  /** Human-readable audience note for internal bots; never an access-control list. */
  accessNote: string;
  instructions: string;
  faqs: ChatbotFaq[];
  fallbackMessage: string;
  /** OpenRouter model identifier, for example `openai/gpt-4o-mini`. */
  model: string;
};

export type ChatbotDocument = ChatbotDraft & {
  workspaceId: string;
  revision: number;
  status: ChatbotStatus;
  enabled: boolean;
  channelProvider: ChatbotProvider | null;
  updatedAt: string;
  updatedBy: string;
};

export type ChatbotActor = {
  actorId: string;
  role: 'workspace_admin';
};

type CommandBase = {
  workspaceId: string;
  expectedRevision: number;
  actor: ChatbotActor;
  occurredAt: string;
};

export type ChatbotCommand =
  | (CommandBase & { type: 'update_draft'; patch: Partial<ChatbotDraft> })
  /** `channelReady` is computed server-side right before the reducer runs — the pure reducer never queries anything itself. */
  | (CommandBase & { type: 'select_channel'; provider: ChatbotProvider | null; channelReady: boolean })
  | (CommandBase & { type: 'publish' })
  | (CommandBase & { type: 'set_enabled'; enabled: boolean; channelReady: boolean });

export type ChatbotHistoryAction = 'provisioned' | 'draft_updated' | 'channel_selected' | 'published' | 'enabled_changed';

export type ChatbotIssue = { field: string; message: string };

export type ChatbotMutationResult =
  | { success: true; document: ChatbotDocument; action: ChatbotHistoryAction }
  | {
      success: false;
      code:
        | 'unauthorized'
        | 'workspace_mismatch'
        | 'stale_revision'
        | 'invalid_configuration'
        | 'not_published'
        | 'channel_not_ready';
      issues?: ChatbotIssue[];
    };

/** Documents, in one place, exactly what this feature deliberately does NOT do. */
export const CHATBOT_SAFETY_POLICY = Object.freeze({
  memory: 'none',
  persistentMemory: false,
  crm: false,
  tools: false,
  campaigns: false,
  tasks: false,
  specialistRouting: false,
} as const);
