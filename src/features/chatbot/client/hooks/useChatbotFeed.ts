import { useEffect, useState } from 'react';
import { emptyChatbotDraft } from '../../configuration';
import type { ChatbotDraft, ChatbotProvider, ChatbotDocument } from '../../types';
import {
  fetchChatbot,
  sendChatbotCommand,
  testChatbotQuestion,
  type ChannelEligibility,
  type ChatbotChannels,
  type ChatbotCommandResult,
} from '../lib/chatbotAdapter';

// Adapter hook for the real, server-persisted Chatbot
// (src/app/api/workspace/[id]/chatbot). Mirrors useOfficeConfigurator.ts's
// shape closely, including its fixed stale-revision bug: `save()` returns
// the freshly-persisted document, and `publish()`/`setEnabled()` use THAT
// document's revision explicitly rather than reading `document.revision`
// from React state within the same call — reading state here would be
// stale, since setDocument's effect hasn't landed yet within this same
// synchronous function.

export type ChatbotTestResult = { question: string; answer: string; source: 'openrouter' | 'fallback' };

export type ChatbotFeed = {
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  status: ChatbotDocument['status'];
  revision: number;
  enabled: boolean;
  channelProvider: ChatbotProvider | null;
  channels: ChatbotChannels;
  draft: ChatbotDraft;
  setDraft: (draft: ChatbotDraft) => void;
  patchDraft: (patch: Partial<ChatbotDraft>) => void;
  hasUnsavedChanges: boolean;
  lastResult: ChatbotCommandResult | null;
  save: () => Promise<ChatbotDocument | null>;
  publish: () => Promise<void>;
  selectChannel: (provider: ChatbotProvider | null) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  testing: boolean;
  testResult: ChatbotTestResult | null;
  testQuestion: (text: string) => Promise<void>;
};

const EMPTY_CHANNELS: ChatbotChannels = {
  whatsapp: { eligible: false, reason: null },
  telegram: { eligible: false, reason: null },
};

function draftFrom(document: ChatbotDocument): ChatbotDraft {
  const { name, useCase, purpose, accessNote, instructions, faqs, fallbackMessage, model } = document;
  return { name, useCase, purpose, accessNote, instructions, faqs: faqs.map((faq) => ({ ...faq })), fallbackMessage, model };
}

function sameDraft(a: ChatbotDraft, b: ChatbotDraft): boolean {
  return (
    a.name === b.name &&
    a.useCase === b.useCase &&
    a.purpose === b.purpose &&
    a.accessNote === b.accessNote &&
    a.instructions === b.instructions &&
    a.fallbackMessage === b.fallbackMessage &&
    a.model === b.model &&
    a.faqs.length === b.faqs.length &&
    a.faqs.every((faq, index) => faq.id === b.faqs[index]?.id && faq.question === b.faqs[index]?.question && faq.answer === b.faqs[index]?.answer)
  );
}

export function useChatbotFeed(workspaceId: string): ChatbotFeed {
  const [document, setDocument] = useState<ChatbotDocument | null>(null);
  const [channels, setChannels] = useState<ChatbotChannels>(EMPTY_CHANNELS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraftState] = useState<ChatbotDraft>(emptyChatbotDraft());
  const [lastResult, setLastResult] = useState<ChatbotCommandResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ChatbotTestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChatbot(workspaceId).then((result) => {
      if (cancelled) return;
      if (result.status === 'error') {
        setLoadError(result.message);
      } else {
        setDocument(result.head.document);
        setChannels(result.channels);
        setDraftState(draftFrom(result.head.document));
        setLoadError(null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const setDraft = (next: ChatbotDraft) => setDraftState({ ...next, faqs: next.faqs.map((faq) => ({ ...faq })) });
  const patchDraft = (patch: Partial<ChatbotDraft>) => setDraft({ ...draft, ...patch });

  const hasUnsavedChanges = document !== null && !sameDraft(draft, draftFrom(document));

  const runCommand = async (
    command: Parameters<typeof sendChatbotCommand>[2],
    revisionOverride?: number,
  ): Promise<ChatbotCommandResult> => {
    if (!document) return { status: 'error', code: null, message: 'chatbot_not_loaded' };
    setSaving(true);
    const result = await sendChatbotCommand(workspaceId, revisionOverride ?? document.revision, command);
    setSaving(false);
    setLastResult(result);
    if (result.status === 'ok') {
      setDocument(result.document);
      setChannels(result.channels);
      setDraftState(draftFrom(result.document));
    }
    return result;
  };

  /** Returns the final persisted document (or null if the command failed), so callers like `publish` can chain off the real latest revision instead of a stale closure value. */
  const save = async (): Promise<ChatbotDocument | null> => {
    if (!document) return null;
    if (!hasUnsavedChanges) return document;
    const result = await runCommand({ type: 'update_draft', patch: draft });
    return result.status === 'ok' ? result.document : null;
  };

  const publish = async () => {
    const saved = await save();
    if (!saved) return;
    await runCommand({ type: 'publish' }, saved.revision);
  };

  // Both save() first: the server's response to select_channel/set_enabled
  // reflects the document AS SAVED, and commit() below resets local draft
  // state to match whatever document comes back — without saving first,
  // any name/instructions/FAQ edits still pending in `draft` would be
  // silently overwritten by that stale server document and lost.
  const selectChannel = async (provider: ChatbotProvider | null) => {
    const saved = await save();
    if (!saved) return;
    await runCommand({ type: 'select_channel', provider }, saved.revision);
  };

  const setEnabled = async (enabled: boolean) => {
    const saved = await save();
    if (!saved) return;
    await runCommand({ type: 'set_enabled', enabled }, saved.revision);
  };

  const testQuestion = async (text: string): Promise<void> => {
    const question = text.trim();
    if (!question) return;
    setTesting(true);
    const result = await testChatbotQuestion(workspaceId, question);
    setTesting(false);
    if (result.status === 'ok') {
      setTestResult({ question, answer: result.answer, source: result.source });
    } else {
      setTestResult(null);
    }
  };

  return {
    loading,
    loadError,
    saving,
    status: document?.status ?? 'draft',
    revision: document?.revision ?? 0,
    enabled: document?.enabled ?? false,
    channelProvider: document?.channelProvider ?? null,
    channels,
    draft,
    setDraft,
    patchDraft,
    hasUnsavedChanges,
    lastResult,
    save,
    publish,
    selectChannel,
    setEnabled,
    testing,
    testResult,
    testQuestion,
  };
}

export type { ChannelEligibility };
