// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatbotFeed } from './useChatbotFeed';
import { emptyChatbotDocument } from '../../configuration';
import type { ChatbotDocument } from '../../types';

// Regression test for a real bug found during local end-to-end validation:
// clicking a channel card (WhatsApp/Telegram) right after typing unsaved
// draft edits (name/instructions/FAQs) silently DISCARDED those edits.
// selectChannel() sent a bare `select_channel` command without saving the
// pending draft first; the server's response (built from whatever it still
// had persisted — the OLD, pre-edit document) then got written back into
// local `draft` state via commit()'s `setDraftState(draftFrom(...))`,
// overwriting the user's still-unsaved typing. The fix makes
// selectChannel()/setEnabled() call save() first, exactly like publish()
// already did for the analogous stale-revision problem.

vi.mock('../lib/chatbotAdapter', () => ({
  fetchChatbot: vi.fn(),
  sendChatbotCommand: vi.fn(),
  testChatbotQuestion: vi.fn(),
}));

const { fetchChatbot, sendChatbotCommand } = await import('../lib/chatbotAdapter');

const WORKSPACE = 'workspace-test';
const CHANNELS = {
  whatsapp: { eligible: true, reason: null },
  telegram: { eligible: true, reason: null },
};

function baseDocument(): ChatbotDocument {
  return emptyChatbotDocument(WORKSPACE, 'admin@test', '2026-07-24T00:00:00.000Z');
}

describe('useChatbotFeed — selecting a channel never discards unsaved draft edits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves the pending draft before sending select_channel, so the server (and local state) reflect BOTH the edits and the channel', async () => {
    const initial = baseDocument(); // revision 1

    vi.mocked(fetchChatbot).mockResolvedValue({ status: 'ok', head: { revision: initial.revision, status: initial.status, enabled: initial.enabled, document: initial, updatedAt: initial.updatedAt, updatedBy: initial.updatedBy }, channels: CHANNELS });

    const afterSave: ChatbotDocument = { ...initial, revision: 2, name: 'Ayuda Acme', purpose: 'Resolver dudas' };
    const afterChannel: ChatbotDocument = { ...afterSave, revision: 3, channelProvider: 'whatsapp' };

    const sendMock = vi.mocked(sendChatbotCommand);
    sendMock.mockImplementation(async (_workspaceId, _expectedRevision, command) => {
      if (command.type === 'update_draft') return { status: 'ok', document: afterSave, channels: CHANNELS };
      if (command.type === 'select_channel') return { status: 'ok', document: afterChannel, channels: CHANNELS };
      throw new Error('unexpected command in test: ' + command.type);
    });

    const { result } = renderHook(() => useChatbotFeed(WORKSPACE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.patchDraft({ name: 'Ayuda Acme', purpose: 'Resolver dudas' });
    });

    await act(async () => {
      await result.current.selectChannel('whatsapp');
    });

    // The actual regression: two commands sent (save the draft, THEN select
    // the channel) — not just the bare select_channel that used to wipe the
    // pending edits.
    expect(sendMock).toHaveBeenCalledTimes(2);
    const [, , firstCommand] = sendMock.mock.calls[0];
    const [, secondRevisionArg, secondCommand] = sendMock.mock.calls[1];
    expect(firstCommand).toMatchObject({ type: 'update_draft', patch: expect.objectContaining({ name: 'Ayuda Acme', purpose: 'Resolver dudas' }) });
    expect(secondCommand).toEqual({ type: 'select_channel', provider: 'whatsapp' });
    // Must use the revision save() just produced (2), not the stale pre-save one (1).
    expect(secondRevisionArg).toBe(2);

    // Final state reflects BOTH the draft edits and the channel — neither was lost.
    expect(result.current.draft.name).toBe('Ayuda Acme');
    expect(result.current.draft.purpose).toBe('Resolver dudas');
    expect(result.current.channelProvider).toBe('whatsapp');
  });

  it('does not send an update_draft command at all when there is nothing unsaved', async () => {
    const initial = baseDocument();
    vi.mocked(fetchChatbot).mockResolvedValue({ status: 'ok', head: { revision: initial.revision, status: initial.status, enabled: initial.enabled, document: initial, updatedAt: initial.updatedAt, updatedBy: initial.updatedBy }, channels: CHANNELS });

    const afterChannel: ChatbotDocument = { ...initial, revision: 2, channelProvider: 'telegram' };
    const sendMock = vi.mocked(sendChatbotCommand);
    sendMock.mockImplementation(async (_workspaceId, _expectedRevision, command) => {
      if (command.type === 'select_channel') return { status: 'ok', document: afterChannel, channels: CHANNELS };
      throw new Error('unexpected command in test: ' + command.type);
    });

    const { result } = renderHook(() => useChatbotFeed(WORKSPACE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.selectChannel('telegram');
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][2]).toEqual({ type: 'select_channel', provider: 'telegram' });
  });
});
