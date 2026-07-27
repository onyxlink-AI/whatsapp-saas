import type {
  ChatbotCommand,
  ChatbotDocument,
  ChatbotDraft,
  ChatbotFaq,
  ChatbotHistoryAction,
  ChatbotIssue,
  ChatbotMutationResult,
} from './types';

function cloneDraft(draft: ChatbotDraft): ChatbotDraft {
  return { ...draft, faqs: draft.faqs.map((faq): ChatbotFaq => ({ ...faq })) };
}

export function emptyChatbotDraft(): ChatbotDraft {
  return {
    name: '',
    useCase: 'external_faq',
    purpose: '',
    accessNote: '',
    instructions: '',
    faqs: [],
    fallbackMessage: 'No tengo esa información. Consulta con una persona del equipo.',
    model: 'openai/gpt-4o-mini',
  };
}

export function emptyChatbotDocument(workspaceId: string, actorId: string, occurredAt: string): ChatbotDocument {
  return {
    ...emptyChatbotDraft(),
    workspaceId,
    revision: 1,
    status: 'draft',
    enabled: false,
    channelProvider: null,
    updatedAt: occurredAt,
    updatedBy: actorId,
  };
}

function validateText(issues: ChatbotIssue[], field: string, value: string, maxLength: number): void {
  const length = value.trim().length;
  if (length === 0) issues.push({ field, message: 'El campo es obligatorio.' });
  if (length > maxLength) issues.push({ field, message: `El campo no puede superar ${maxLength} caracteres.` });
}

export function validateChatbotDraft(draft: ChatbotDraft): ChatbotIssue[] {
  const issues: ChatbotIssue[] = [];
  validateText(issues, 'name', draft.name, 120);
  validateText(issues, 'purpose', draft.purpose, 500);
  validateText(issues, 'instructions', draft.instructions, 12_000);
  validateText(issues, 'fallbackMessage', draft.fallbackMessage, 1_000);
  validateText(issues, 'model', draft.model, 200);
  if (draft.accessNote.length > 500) {
    issues.push({ field: 'accessNote', message: 'El campo no puede superar 500 caracteres.' });
  }
  if (draft.faqs.length === 0) {
    issues.push({ field: 'faqs', message: 'Añade al menos una pregunta frecuente.' });
  }
  if (draft.faqs.length > 100) {
    issues.push({ field: 'faqs', message: 'No puede haber más de 100 preguntas frecuentes.' });
  }
  draft.faqs.forEach((faq, index) => {
    validateText(issues, `faqs.${index}.question`, faq.question, 500);
    validateText(issues, `faqs.${index}.answer`, faq.answer, 4_000);
  });
  return issues;
}

export function applyChatbotCommand(current: ChatbotDocument, command: ChatbotCommand): ChatbotMutationResult {
  if (command.actor.role !== 'workspace_admin') {
    return { success: false, code: 'unauthorized' };
  }
  if (command.workspaceId !== current.workspaceId) {
    return { success: false, code: 'workspace_mismatch' };
  }
  if (command.expectedRevision !== current.revision) {
    return { success: false, code: 'stale_revision' };
  }

  const next: ChatbotDocument = {
    ...current,
    ...cloneDraft(current),
    revision: current.revision + 1,
    updatedAt: command.occurredAt,
    updatedBy: command.actor.actorId,
  };
  let action: ChatbotHistoryAction;

  if (command.type === 'update_draft') {
    Object.assign(next, command.patch);
    if (command.patch.faqs) next.faqs = command.patch.faqs.map((faq): ChatbotFaq => ({ ...faq }));
    next.status = 'draft';
    action = 'draft_updated';
  } else if (command.type === 'select_channel') {
    if (command.provider !== null && !command.channelReady) {
      return { success: false, code: 'channel_not_ready' };
    }
    if (command.provider !== current.channelProvider) {
      next.enabled = false;
    }
    next.channelProvider = command.provider;
    // Deliberately does NOT reset status to 'draft': picking a channel is an
    // infrastructure/connection concern, not a content edit — unlike
    // update_draft, it shouldn't force re-publishing content that hasn't
    // changed.
    action = 'channel_selected';
  } else if (command.type === 'publish') {
    const issues = validateChatbotDraft(next);
    if (issues.length > 0) return { success: false, code: 'invalid_configuration', issues };
    next.status = 'published';
    action = 'published';
  } else {
    if (command.enabled) {
      if (current.status !== 'published') return { success: false, code: 'not_published' };
      if (current.channelProvider === null || !command.channelReady) return { success: false, code: 'channel_not_ready' };
    }
    next.enabled = command.enabled;
    action = 'enabled_changed';
  }

  return { success: true, document: next, action };
}
