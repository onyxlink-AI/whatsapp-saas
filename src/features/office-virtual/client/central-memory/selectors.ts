import type {
  CentralMemoryState,
  ContactMemoryItem,
  ContactMemoryProfile,
  MemoryCategory,
  MemorySource,
} from './types';

const SOURCES: MemorySource[] = ['whatsapp', 'voice', 'manual', 'automation'];

export type MemorySearchFilter = {
  sources?: MemorySource[];
  categories?: MemoryCategory[];
  includeSensitive?: boolean;
  limit?: number;
};

export type MemorySearchResult = {
  profile: ContactMemoryProfile;
  matchingItems: ContactMemoryItem[];
};

export type MemoryOverview = {
  contacts: number;
  items: number;
  sensitiveItems: number;
  crossChannelContacts: number;
  bySource: Record<MemorySource, number>;
};

export function selectContactMemory(
  state: CentralMemoryState,
  contactId: string,
): ContactMemoryProfile | null {
  return state.profiles[contactId] ?? null;
}

export function selectMemoryProfiles(state: CentralMemoryState): ContactMemoryProfile[] {
  return Object.values(state.profiles).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export function selectMemoryOverview(state: CentralMemoryState): MemoryOverview {
  const profiles = Object.values(state.profiles);
  const items = profiles.flatMap((profile) => profile.items);
  const bySource = { whatsapp: 0, voice: 0, manual: 0, automation: 0 };
  for (const item of items) bySource[item.source] += 1;

  return {
    contacts: profiles.length,
    items: items.length,
    sensitiveItems: items.filter((item) => item.sensitivity === 'sensitive').length,
    crossChannelContacts: profiles.filter((profile) => {
      const sources = new Set([...profile.summarySources, ...profile.items.map((item) => item.source)]);
      return sources.size > 1;
    }).length,
    bySource,
  };
}

export function searchContactMemories(
  state: CentralMemoryState,
  query: string,
  filter: MemorySearchFilter = {},
): MemorySearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const sources = filter.sources ? new Set(filter.sources) : null;
  const categories = filter.categories ? new Set(filter.categories) : null;
  const includeSensitive = filter.includeSensitive ?? false;
  const limit = Math.max(0, filter.limit ?? 50);

  return selectMemoryProfiles(state)
    .map((profile) => {
      const profileMatches = [profile.displayName, profile.phoneMasked, profile.summary]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase('es').includes(normalizedQuery));
      const matchingItems = profile.items.filter((item) => {
        if (!includeSensitive && item.sensitivity === 'sensitive') return false;
        if (sources && !sources.has(item.source)) return false;
        if (categories && !categories.has(item.category)) return false;
        return normalizedQuery === '' || profileMatches || item.value.toLocaleLowerCase('es').includes(normalizedQuery);
      });

      return { profile, matchingItems, profileMatches };
    })
    .filter((result) => result.profileMatches || result.matchingItems.length > 0)
    .slice(0, limit)
    .map(({ profile, matchingItems }) => ({ profile, matchingItems }));
}

export function selectMemorySources(profile: ContactMemoryProfile): MemorySource[] {
  const present = new Set([...profile.summarySources, ...profile.items.map((item) => item.source)]);
  return SOURCES.filter((source) => present.has(source));
}

