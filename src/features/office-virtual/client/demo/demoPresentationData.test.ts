import { describe, expect, it } from 'vitest';
import { validateOfficeConfiguration } from '../central-integrations/configuration';
import { CONFIGURABLE_AGENT_IDS } from '../central-integrations/specialist-seats';
import {
  createDemoCapabilitySnapshot,
  createDemoOfficeConfiguration,
  createDemoOfficeEvents,
  projectDemoSpecialists,
} from './demoPresentationData';

describe('office demo presentation data', () => {
  it('creates a complete, valid eight-specialist showroom document', () => {
    const document = createDemoOfficeConfiguration('workspace-demo-a');
    expect(validateOfficeConfiguration(document)).toEqual([]);
    expect(projectDemoSpecialists(document)).toHaveLength(CONFIGURABLE_AGENT_IDS.length);
    expect(Object.values(document.specialists).every((specialist) => specialist.enabled && specialist.templateId)).toBe(true);
  });

  it('scopes every synthetic activity to the selected demo workspace', () => {
    const events = createDemoOfficeEvents('workspace-demo-a', Date.parse('2026-07-29T12:00:00.000Z'));
    expect(events.length).toBeGreaterThan(100);
    expect(events.every((event) => event.workspaceId === 'workspace-demo-a')).toBe(true);
    expect(events.some((event) => event.status === 'working')).toBe(true);
    expect(events.some((event) => event.status === 'approval_required')).toBe(true);
  });

  it('never reuses a capability snapshot across workspaces', () => {
    expect(createDemoCapabilitySnapshot('workspace-a').workspaceId).toBe('workspace-a');
    expect(createDemoCapabilitySnapshot('workspace-b').workspaceId).toBe('workspace-b');
  });
});
