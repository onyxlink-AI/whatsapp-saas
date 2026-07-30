import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { GlobalSearchCategory, GlobalSearchResult } from '../central-search';
import type { GlobalSearchFeed } from '../hooks/useGlobalSearch';
import { relativeTime } from '../lib/relativeTime';
import { SEARCH_CATEGORY_LABEL_ES, SEARCH_CATEGORY_ORDER, SEARCH_CATEGORY_TW, SEARCH_ERROR_LABEL_ES } from '../lib/searchStyles';
import ViewHeader from './ui/ViewHeader';

// Presentational only — consumes Codex's real src/central-search +
// src/hooks/useGlobalSearch.ts (GlobalSearchFeed) as-is. No reducer, fixtures
// or provisional hook live here; grouping by category below is purely a
// display concern over `feed.results`, not a re-implementation of the
// relevance/ranking logic in `searchWorkspace`. See COORDINACION_CLAUDE_CODEX.md.

type Props = {
  feed: GlobalSearchFeed;
  /** Wiring for "cada resultado debe permitir abrir su vista correspondiente" — the
   * caller decides how `result.target` (view + entityId + contactId) maps to
   * actual navigation (change activeView, open a panel, etc.). */
  onOpenResult: (result: GlobalSearchResult) => void;
};

type ResultGroup = { category: GlobalSearchCategory; results: GlobalSearchResult[] };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, 'ig'));
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        part.toLocaleLowerCase('es') === trimmed.toLocaleLowerCase('es') ? (
          <mark key={i} className="bg-[#83CFCE]/30 text-[#DFF3F3] rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function ResultRow({
  result,
  query,
  focused,
  onOpen,
  onHover,
  rowRef,
}: {
  result: GlobalSearchResult;
  query: string;
  focused: boolean;
  onOpen: () => void;
  onHover: () => void;
  rowRef: (el: HTMLButtonElement | null) => void;
}) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamp is meant to reflect wall-clock time at render.
  const now = Date.now();
  return (
    <button
      ref={rowRef}
      onClick={onOpen}
      onMouseEnter={onHover}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-start gap-3 ${
        focused ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.035]'
      }`}
    >
      <span className={`shrink-0 mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${SEARCH_CATEGORY_TW[result.category]}`}>
        {SEARCH_CATEGORY_LABEL_ES[result.category]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white/90 truncate">
          <Highlighted text={result.title} query={query} />
        </div>
        {result.subtitle && <div className="text-[11px] text-white/40 truncate mt-0.5">{result.subtitle}</div>}
        {result.excerpt && (
          <div className="text-[11px] text-white/50 truncate mt-0.5">
            <Highlighted text={result.excerpt} query={query} />
          </div>
        )}
      </div>
      {result.occurredAt && <span className="shrink-0 text-[10px] text-white/25">{relativeTime(result.occurredAt, now)}</span>}
    </button>
  );
}

export default function BuscarView({ feed, onOpenResult }: Props) {
  const { query, setQuery, category, setCategory, results, total, loading, error } = feed;
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const groups: ResultGroup[] = useMemo(
    () =>
      SEARCH_CATEGORY_ORDER.map((cat) => ({ category: cat, results: results.filter((r) => r.category === cat) })).filter(
        (group) => group.results.length > 0,
      ),
    [results],
  );

  const flatResults = useMemo(() => groups.flatMap((g) => g.results), [groups]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets keyboard-nav focus whenever the query/category (external filters) change.
    setFocusedIndex(0);
    rowRefs.current = [];
  }, [query, category]);

  useEffect(() => {
    rowRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatResults[focusedIndex];
      if (target) onOpenResult(target);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={Search}
        title="Búsqueda global"
        description="Encuentra contactos, conversaciones, tareas, rutinas, recuerdos y eventos sin cambiar de módulo."
        guide={{
          title: 'Búsqueda más precisa',
          items: [
            'Escribe un nombre, teléfono, tarea o concepto recordado.',
            'Usa las categorías para reducir resultados cuando la búsqueda sea amplia.',
            'Navega con las flechas y pulsa Intro para abrir el resultado seleccionado.',
          ],
        }}
      />

      <div className="px-6 pt-3 pb-2 border-b border-white/[0.06] shrink-0 flex flex-col gap-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar en toda la Oficina Virtual..."
          aria-label="Buscar"
          className="onyx-input w-full rounded-md px-3 py-2.5 text-sm"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setCategory('all')}
            className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors ${
              category === 'all' ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/10 text-[#BFE7E6]' : 'border-white/10 text-white/45 hover:text-white/70'
            }`}
          >
            Todos
          </button>
          {SEARCH_CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors ${
                category === cat ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/10 text-[#BFE7E6]' : 'border-white/10 text-white/45 hover:text-white/70'
              }`}
            >
              {SEARCH_CATEGORY_LABEL_ES[cat]}
            </button>
          ))}
          {query.trim() && !loading && !error && (
            <span className="text-[11px] text-white/25 ml-auto shrink-0">{total} resultado(s)</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!query.trim() ? (
          <div className="text-sm text-white/30 text-center mt-12">
            Escribe para buscar en contactos, conversaciones, tareas, rutinas, memoria y actividad.
          </div>
        ) : loading ? (
          <div className="space-y-2 max-w-2xl">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-rose-300/70 text-center mt-12">{SEARCH_ERROR_LABEL_ES[error] ?? error}</div>
        ) : groups.length === 0 ? (
          <div className="text-sm text-white/30 text-center mt-12">Sin resultados para &ldquo;{query}&rdquo;.</div>
        ) : (
          <div className="space-y-4 max-w-2xl">
            {groups.map((group) => (
              <div key={group.category}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-1.5">
                  {SEARCH_CATEGORY_LABEL_ES[group.category]} · {group.results.length}
                </div>
                <div className="space-y-1.5">
                  {group.results.map((result) => {
                    const currentIndex = flatResults.indexOf(result);
                    return (
                      <ResultRow
                        key={result.id}
                        result={result}
                        query={query}
                        focused={currentIndex === focusedIndex}
                        onOpen={() => onOpenResult(result)}
                        onHover={() => setFocusedIndex(currentIndex)}
                        rowRef={(el) => {
                          rowRefs.current[currentIndex] = el;
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
