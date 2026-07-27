// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOfficeConfigurator } from './useOfficeConfigurator';
import type { OfficeConfigurationDocument } from '../central-integrations/configuration';
import { createOfficeConfigurationDocument } from '../central-integrations/configuration';
import { provisionWorkspaceOffice } from '../central-integrations/preset';

// Regression test for a real bug found during local end-to-end validation:
// clicking "Publicar" on a specialist that had just been toggled on sent the
// publish command with a STALE revision and got a spurious 409 from the
// server's own concurrency check. `publish()` called `save()` (which
// persists the pending edit and bumps the revision) and then immediately
// read `document.revision` from the hook's React state closure — which
// still held the pre-save value, since `setDocument` inside `save()` only
// takes effect on the *next* render, not synchronously within the same
// `publish()` call. The fix makes `save()` return the document it actually
// persisted, and `publish()` uses that revision directly instead of the
// closure.

vi.mock('../lib/saasOfficeConfigurationAdapter', () => ({
  fetchOfficeConfiguration: vi.fn(),
  sendOfficeConfigurationCommand: vi.fn(),
}));

const { fetchOfficeConfiguration, sendOfficeConfigurationCommand } = await import('../lib/saasOfficeConfigurationAdapter');

const WORKSPACE = 'workspace-test';

beforeEach(() => {
  vi.clearAllMocks();
});

function baseDocument(): OfficeConfigurationDocument {
  const provisioned = provisionWorkspaceOffice(WORKSPACE, '2026-07-23T00:00:00.000Z');
  return createOfficeConfigurationDocument(provisioned, 'admin@test', '2026-07-23T00:00:00.000Z');
}

describe('useOfficeConfigurator — publish after save uses the fresh revision', () => {
  it('sends the publish command with the revision save() just produced, not the stale pre-save one', async () => {
    const initial = baseDocument(); // revision 1
    const afterUpdateSpecialist = { ...initial, revision: 2, specialists: { ...initial.specialists, 'specialist-1': { ...initial.specialists['specialist-1'], enabled: true } } };
    const afterPublish = { ...afterUpdateSpecialist, revision: 3, status: 'published' as const };

    vi.mocked(fetchOfficeConfiguration).mockResolvedValue({
      status: 'ok',
      head: { presetId: initial.presetId, presetVersion: initial.presetVersion, revision: initial.revision, status: initial.status, document: initial, updatedAt: initial.updatedAt, updatedBy: initial.updatedBy },
      realIntegrations: {},
      openRouterStatus: 'configured',
    });

    const sendMock = vi.mocked(sendOfficeConfigurationCommand);
    sendMock.mockImplementation(async (_workspaceId, _expectedRevision, command) => {
      if (command.type === 'update_specialist') return { status: 'ok', document: afterUpdateSpecialist, realIntegrations: {}, openRouterStatus: 'configured' };
      if (command.type === 'publish') return { status: 'ok', document: afterPublish, realIntegrations: {}, openRouterStatus: 'configured' };
      throw new Error('unexpected command in test: ' + command.type);
    });

    const { result } = renderHook(() => useOfficeConfigurator(WORKSPACE));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateSpecialistDraft('specialist-1', { enabled: true });
    });

    await act(async () => {
      await result.current.publish();
    });

    // Exactly two commands were sent: the pending specialist edit, then publish.
    expect(sendMock).toHaveBeenCalledTimes(2);
    const [, updateRevisionArg] = sendMock.mock.calls[0];
    const [, publishRevisionArg, publishCommand] = sendMock.mock.calls[1];

    expect(updateRevisionArg).toBe(1); // pre-save revision, correct
    expect(publishCommand).toEqual({ type: 'publish' });
    // This is the actual regression: must be 2 (the revision save() just
    // returned), not 1 (the stale value the closure bug used to send).
    expect(publishRevisionArg).toBe(2);

    expect(result.current.status).toBe('published');
    expect(result.current.revision).toBe(3);
  });
});

// Regression test for a second, related bug: applyVertical/restoreRevision/
// resetSpecialist all replace the ENTIRE document with the server's
// response (applyDocument resets every seat's local draft, not just the one
// being acted on). Calling any of them while ANOTHER seat had an unsaved
// local edit pending used to silently discard that edit the instant the
// server's document overwrote local state — exactly the kind of invisible
// data loss the product explicitly forbids ("No perder cambios al cambiar
// de plantilla, sector o especialista").
describe('useOfficeConfigurator — applyVertical never silently discards another seat\'s unsaved edit', () => {
  it('saves the pending edit first, so it survives inside the document apply_vertical returns', async () => {
    const initial = baseDocument(); // revision 1
    const afterSaveEdit = {
      ...initial,
      revision: 2,
      specialists: { ...initial.specialists, 'specialist-2': { ...initial.specialists['specialist-2'], name: 'Editado localmente' } },
    };
    // The vertical apply itself only touches empty seats — specialist-2 stays
    // exactly as the save just persisted it.
    const afterVertical = { ...afterSaveEdit, revision: 3, sectorId: 'clinica-dental' as const };

    vi.mocked(fetchOfficeConfiguration).mockResolvedValue({
      status: 'ok',
      head: { presetId: initial.presetId, presetVersion: initial.presetVersion, revision: initial.revision, status: initial.status, document: initial, updatedAt: initial.updatedAt, updatedBy: initial.updatedBy },
      realIntegrations: {},
      openRouterStatus: 'configured',
    });

    const sendMock = vi.mocked(sendOfficeConfigurationCommand);
    sendMock.mockImplementation(async (_workspaceId, _expectedRevision, command) => {
      if (command.type === 'update_specialist') return { status: 'ok', document: afterSaveEdit, realIntegrations: {}, openRouterStatus: 'configured' };
      if (command.type === 'apply_vertical') return { status: 'ok', document: afterVertical, realIntegrations: {}, openRouterStatus: 'configured' };
      throw new Error('unexpected command in test: ' + command.type);
    });

    const { result } = renderHook(() => useOfficeConfigurator(WORKSPACE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Local, unsaved edit to specialist-2 — never explicitly saved by the test.
    act(() => {
      result.current.updateSpecialistDraft('specialist-2', { name: 'Editado localmente' });
    });
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      await result.current.applyVertical('clinica-dental');
    });

    // The pending edit must have been sent (as update_specialist) BEFORE apply_vertical.
    const commandTypes = sendMock.mock.calls.map(([, , command]) => command.type);
    expect(commandTypes).toEqual(['update_specialist', 'apply_vertical']);

    // And the edit must still be present in the final state — never reverted.
    expect(result.current.specialistDrafts['specialist-2'].name).toBe('Editado localmente');
    expect(result.current.sectorId).toBe('clinica-dental');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });
});
