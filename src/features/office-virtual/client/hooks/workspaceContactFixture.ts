import { adaptSaasContact360, createSaasContact360Fixture } from '../central-contacts';
import type { Contact360 } from '../central-contacts/types';
import type { SaasContact360Input } from '../central-contacts/saas-adapter';

// Shared by useContact360Feed and useInboxFeed. Codex's fixture
// (central-contacts/fixtures.ts) hardcodes every row — contact, conversation,
// last message, last voice call, memory, deal — to 'workspace-demo'. Both
// central-contacts' own adaptSaasContact360 and central-inbox's
// projectInboxThread reject the fixture outright (`workspace_mismatch`) the
// moment any row disagrees with the contact's workspace_id, so this
// restamps every nested row to the real workspaceId before either adapter
// ever sees it — never touches central-contacts itself.
export function scopedContactFixtureInput(workspaceId: string): SaasContact360Input {
  const base = createSaasContact360Fixture();
  return {
    ...base,
    contact: { ...base.contact, workspace_id: workspaceId },
    conversation: base.conversation ? { ...base.conversation, workspace_id: workspaceId } : null,
    lastMessage: base.lastMessage ? { ...base.lastMessage, workspace_id: workspaceId } : null,
    lastVoiceCall: base.lastVoiceCall ? { ...base.lastVoiceCall, workspace_id: workspaceId } : null,
    memory: base.memory ? { ...base.memory, workspace_id: workspaceId } : null,
    latestDeal: base.latestDeal ? { ...base.latestDeal, workspace_id: workspaceId } : null,
  };
}

export function seedScopedContact(workspaceId: string): Contact360 | null {
  const result = adaptSaasContact360(scopedContactFixtureInput(workspaceId));
  return result.success ? result.contact : null;
}
