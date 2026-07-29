import { useMemo, useState } from 'react';
import { searchWorkspace } from '../central-search';
import type { GlobalSearchActor, GlobalSearchCategory, GlobalSearchResult, GlobalSearchSources } from '../central-search';

export type GlobalSearchFeed = {
  query: string;
  setQuery: (query: string) => void;
  category: GlobalSearchCategory | 'all';
  setCategory: (category: GlobalSearchCategory | 'all') => void;
  results: GlobalSearchResult[];
  total: number;
  loading: boolean;
  error: 'unauthorized' | 'workspace_mismatch' | null;
};

export function useGlobalSearch(workspaceId: string, actor: GlobalSearchActor, sources: GlobalSearchSources): GlobalSearchFeed {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GlobalSearchCategory | 'all'>('all');
  const response = useMemo(() => searchWorkspace(
    actor,
    { workspaceId, query, categories: category === 'all' ? undefined : [category] },
    sources,
  ), [actor, category, query, sources, workspaceId]);

  return {
    query,
    setQuery,
    category,
    setCategory,
    results: response.success ? response.results : [],
    total: response.success ? response.total : 0,
    loading: false,
    error: response.success ? null : response.error,
  };
}
