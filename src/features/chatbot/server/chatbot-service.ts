import {
  applyChatbotCommand,
  emptyChatbotDocument,
  type ChatbotActor,
  type ChatbotCommand,
  type ChatbotDocument,
  type ChatbotDraft,
  type ChatbotHistoryAction,
  type ChatbotMutationResult,
  type ChatbotProvider,
  type ChatbotStatus,
} from '../index';

export type ChatbotHead = {
  revision: number;
  status: ChatbotStatus;
  enabled: boolean;
  document: ChatbotDocument;
  updatedAt: string;
  updatedBy: string;
};

export type ChatbotStore = {
  loadHead(workspaceId: string): Promise<ChatbotHead | null>;
  saveHead(workspaceId: string, head: ChatbotHead, actorUserId: string | null): Promise<void>;
  appendRevision(
    workspaceId: string,
    entry: {
      revision: number;
      action: ChatbotHistoryAction;
      actorUserId: string | null;
      actorEmail: string;
      document: ChatbotDocument;
      occurredAt: string;
    },
  ): Promise<void>;
};

/**
 * Live eligibility for a channel — never cached, never persisted as
 * "connection state". Recomputed from workspaces/agents/integrations on
 * every call so the mutual-exclusion rule with the Agente WhatsApp (and the
 * simple "is a Telegram bot token configured" check) can never go stale.
 */
export type ResolveChannelReadiness = (workspaceId: string, provider: ChatbotProvider) => Promise<boolean>;

export type ChatbotServicePorts = {
  store: ChatbotStore;
  resolveChannelReadiness: ResolveChannelReadiness;
  now?: () => string;
};

export async function loadOrProvisionChatbot(
  workspaceId: string,
  actor: ChatbotActor,
  ports: ChatbotServicePorts,
): Promise<ChatbotHead> {
  const existing = await ports.store.loadHead(workspaceId);
  if (existing) return existing;

  const occurredAt = ports.now?.() ?? new Date().toISOString();
  const document = emptyChatbotDocument(workspaceId, actor.actorId, occurredAt);
  const head: ChatbotHead = {
    revision: document.revision,
    status: document.status,
    enabled: document.enabled,
    document,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedBy,
  };

  await ports.store.saveHead(workspaceId, head, null);
  await ports.store.appendRevision(workspaceId, {
    revision: document.revision,
    action: 'provisioned',
    actorUserId: null,
    actorEmail: actor.actorId,
    document,
    occurredAt,
  });

  return head;
}

export type ChatbotCommandInput =
  | { type: 'update_draft'; expectedRevision: number; patch: Partial<ChatbotDraft> }
  | { type: 'select_channel'; expectedRevision: number; provider: ChatbotProvider | null }
  | { type: 'publish'; expectedRevision: number }
  | { type: 'set_enabled'; expectedRevision: number; enabled: boolean };

export type HandleChatbotCommandResult =
  | { success: true; document: ChatbotDocument }
  | (Extract<ChatbotMutationResult, { success: false }> & { success: false });

export async function handleChatbotCommand(
  workspaceId: string,
  actor: ChatbotActor,
  actorUserId: string | null,
  input: ChatbotCommandInput,
  ports: ChatbotServicePorts,
): Promise<HandleChatbotCommandResult> {
  const head = await loadOrProvisionChatbot(workspaceId, actor, ports);
  const occurredAt = ports.now?.() ?? new Date().toISOString();

  let command: ChatbotCommand;
  if (input.type === 'select_channel') {
    const channelReady = input.provider === null ? true : await ports.resolveChannelReadiness(workspaceId, input.provider);
    command = { type: 'select_channel', provider: input.provider, channelReady, workspaceId, actor, occurredAt, expectedRevision: input.expectedRevision };
  } else if (input.type === 'set_enabled') {
    const channelReady = !input.enabled || head.document.channelProvider === null
      ? false
      : await ports.resolveChannelReadiness(workspaceId, head.document.channelProvider);
    command = { type: 'set_enabled', enabled: input.enabled, channelReady, workspaceId, actor, occurredAt, expectedRevision: input.expectedRevision };
  } else if (input.type === 'update_draft') {
    command = { type: 'update_draft', patch: input.patch, workspaceId, actor, occurredAt, expectedRevision: input.expectedRevision };
  } else {
    command = { type: 'publish', workspaceId, actor, occurredAt, expectedRevision: input.expectedRevision };
  }

  const result = applyChatbotCommand(head.document, command);
  if (!result.success) return result;

  const nextHead: ChatbotHead = {
    revision: result.document.revision,
    status: result.document.status,
    enabled: result.document.enabled,
    document: result.document,
    updatedAt: result.document.updatedAt,
    updatedBy: result.document.updatedBy,
  };

  await ports.store.saveHead(workspaceId, nextHead, actorUserId);
  await ports.store.appendRevision(workspaceId, {
    revision: result.document.revision,
    action: result.action,
    actorUserId,
    actorEmail: actor.actorId,
    document: result.document,
    occurredAt,
  });

  return { success: true, document: result.document };
}

export type ChatbotRuntimeConfig = Pick<ChatbotDocument, 'name' | 'useCase' | 'purpose' | 'instructions' | 'faqs' | 'fallbackMessage' | 'model'>;

/**
 * The only function the two channel webhooks call. Fails closed (returns
 * null) unless the chatbot is published, enabled, and bound to exactly this
 * provider — and for WhatsApp, re-validates the live mutual-exclusion rule
 * against the Agente WhatsApp on every single call, never from a cached
 * flag. This must be called fresh for every inbound message.
 */
export async function getChatbotRuntimeConfig(
  workspaceId: string,
  provider: ChatbotProvider,
  ports: ChatbotServicePorts,
): Promise<ChatbotRuntimeConfig | null> {
  try {
    const head = await ports.store.loadHead(workspaceId);
    if (!head) return null;
    const { document } = head;
    if (document.status !== 'published' || !document.enabled || document.channelProvider !== provider) return null;

    const ready = await ports.resolveChannelReadiness(workspaceId, provider);
    if (!ready) return null;

    const { name, useCase, purpose, instructions, faqs, fallbackMessage, model } = document;
    return { name, useCase, purpose, instructions, faqs, fallbackMessage, model };
  } catch {
    return null;
  }
}
