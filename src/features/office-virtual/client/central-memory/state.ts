import type {
  CentralMemoryState,
  ContactMemoryItem,
  ContactMemoryProfile,
  MemoryMutationEvent,
} from './types';

const MAX_PROCESSED_EVENTS = 1_000;
const MAX_FORGOTTEN_IDS = 2_000;

export function createCentralMemoryState(): CentralMemoryState {
  return { profiles: {}, processedEventIds: [], forgottenItemIds: [] };
}

function itemTime(item: ContactMemoryItem): number {
  return Date.parse(item.lastConfirmedAt ?? item.createdAt);
}

function emptyProfile(event: MemoryMutationEvent): ContactMemoryProfile {
  return {
    workspaceId: event.workspaceId,
    contactId: event.contactId,
    summary: '',
    summarySources: [],
    items: [],
    updatedAt: event.occurredAt,
  };
}

export function applyMemoryMutation(
  state: CentralMemoryState,
  event: MemoryMutationEvent,
): CentralMemoryState {
  if (state.processedEventIds.includes(event.id)) return state;

  const existing = state.profiles[event.contactId];
  if (existing && existing.workspaceId !== event.workspaceId) return state;
  const profile = existing ?? emptyProfile(event);
  let nextProfile: ContactMemoryProfile = { ...profile, updatedAt: event.occurredAt };
  let forgottenItemIds = state.forgottenItemIds;

  switch (event.kind) {
    case 'profile.upserted':
      nextProfile = {
        ...nextProfile,
        displayName: event.displayName ?? profile.displayName,
        phoneMasked: event.phoneMasked ?? profile.phoneMasked,
      };
      break;
    case 'summary.updated':
      nextProfile = {
        ...nextProfile,
        summary: event.summary,
        summarySources: [...new Set(event.summarySources)],
      };
      break;
    case 'item.upserted': {
      if (state.forgottenItemIds.includes(event.item.id)) return state;
      const current = profile.items.find((item) => item.id === event.item.id);
      if (current && itemTime(event.item) < itemTime(current)) return state;
      nextProfile = {
        ...nextProfile,
        items: [...profile.items.filter((item) => item.id !== event.item.id), event.item],
      };
      break;
    }
    case 'item.forgotten':
      nextProfile = {
        ...nextProfile,
        items: profile.items.filter((item) => item.id !== event.itemId),
      };
      forgottenItemIds = [event.itemId, ...state.forgottenItemIds.filter((id) => id !== event.itemId)].slice(
        0,
        MAX_FORGOTTEN_IDS,
      );
      break;
  }

  return {
    profiles: { ...state.profiles, [event.contactId]: nextProfile },
    processedEventIds: [event.id, ...state.processedEventIds].slice(0, MAX_PROCESSED_EVENTS),
    forgottenItemIds,
  };
}

export function reduceMemoryMutations(
  events: MemoryMutationEvent[],
  initialState = createCentralMemoryState(),
): CentralMemoryState {
  return events.reduce(applyMemoryMutation, initialState);
}

