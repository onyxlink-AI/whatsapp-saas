import { useState } from 'react';
import type { Contact360 } from '../central-contacts/types';
import type { OfficeActivityEvent } from '../central-events/types';

// Adapter hook for src/central-contacts (Codex's real cross-channel model:
// contacts + conversations + voice_calls + contact_memories + deals, joined
// by workspace + phone — see COORDINACION_CLAUDE_CODEX.md). adaptSaasContact360
// isn't wired to a live Supabase query yet, so this honestly starts empty
// instead of showing the demo fixture (see workspaceContactFixture.ts, still
// used directly by isolation.test.ts) as if it were the workspace's real
// contact. Swapping this for live Supabase rows later won't change what
// ContactosView/Contact360Panel read.

function seedContacts(_workspaceId: string): Contact360[] {
  return [];
}

// The mock office feed (src/central-events/mock-feed.ts) narrates a single
// lead's WhatsApp → voice → deal journey across several entityIds. This maps
// them to the one real Contact360 fixture so the office can prove WhatsApp
// and voice already point at the same person — central-events and
// central-contacts never need to know about each other.
const ENTITY_TO_CONTACT_ID: Record<string, string> = {
  'contact-001': 'contact-lucia',
  'conversation-001': 'contact-lucia',
  'voice-call-001': 'contact-lucia',
  'deal-001': 'contact-lucia',
};

export function resolveContactIdFromEvent(event: OfficeActivityEvent | null | undefined): string | null {
  if (!event?.entityId) return null;
  return ENTITY_TO_CONTACT_ID[event.entityId] ?? null;
}

export type Contact360Feed = {
  contacts: Contact360[];
  getContact: (contactId: string) => Contact360 | null;
};

export function useContact360Feed(workspaceId: string): Contact360Feed {
  const [contacts] = useState<Contact360[]>(() => seedContacts(workspaceId));
  const getContact = (contactId: string) => contacts.find((c) => c.contactId === contactId) ?? null;
  return { contacts, getContact };
}
