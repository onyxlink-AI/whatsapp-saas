import type { Contact360, ContactChannel, ContactStage } from './types';

export type Contact360Filters = {
  query?: string;
  channel?: ContactChannel;
  stage?: ContactStage;
  attentionOnly?: boolean;
};

export function selectContact360List(contacts: Contact360[], filters: Contact360Filters = {}): Contact360[] {
  const query = filters.query?.trim().toLocaleLowerCase('es') ?? '';
  return contacts
    .filter((contact) => !filters.channel || contact.channels.includes(filters.channel))
    .filter((contact) => !filters.stage || contact.stage === filters.stage)
    .filter((contact) => !filters.attentionOnly || contact.attentionReasons.length > 0)
    .filter((contact) => {
      if (!query) return true;
      return [contact.displayName, contact.phoneMasked, contact.emailMasked, contact.memory?.summary, contact.deal?.title]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase('es').includes(query));
    })
    .sort((a, b) => Date.parse(b.latestActivityAt) - Date.parse(a.latestActivityAt));
}

export function selectCrossChannelContacts(contacts: Contact360[]): Contact360[] {
  return contacts.filter((contact) => contact.channels.includes('whatsapp') && contact.channels.includes('voice'));
}
