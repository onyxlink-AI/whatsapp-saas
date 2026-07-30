import { useEffect, useMemo, useState } from 'react';
import { Brain, Trash2 } from 'lucide-react';
import { searchContactMemories, selectMemoryProfiles, selectMemorySources } from '../central-memory';
import type { CentralMemoryState, ContactMemoryItem, MemoryCategory } from '../central-memory/types';
import { relativeTime } from '../lib/relativeTime';
import { SOURCE_LABEL_ES, SOURCE_TW_TEXT } from '../lib/statusStyles';
import ViewHeader from './ui/ViewHeader';

type Props = {
  state: CentralMemoryState;
  onForgetItem: (contactId: string, itemId: string) => void;
  openContactId?: string | null;
  openRequestId?: number;
};

const CATEGORY_LABEL_ES: Record<MemoryCategory, string> = {
  identity: 'Identidad',
  preference: 'Preferencia',
  need: 'Necesidad',
  objection: 'Objeción',
  purchase: 'Compra',
  appointment: 'Cita',
  relationship: 'Relación',
  instruction: 'Instrucción',
  other: 'Otro',
};

function FactRow({
  item,
  now,
  onForget,
}: {
  item: ContactMemoryItem;
  now: number;
  onForget: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 group">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white/80">{item.value}</div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-[11px] text-white/35">
          <span className={SOURCE_TW_TEXT[item.source]}>{SOURCE_LABEL_ES[item.source]}</span>
          <span>·</span>
          <span>{CATEGORY_LABEL_ES[item.category]}</span>
          <span>·</span>
          <span>{Math.round(item.confidence * 100)}% confianza</span>
          {item.sensitivity === 'sensitive' && (
            <>
              <span>·</span>
              <span className="text-amber-300/80">Sensible</span>
            </>
          )}
          <span>·</span>
          <span>{relativeTime(item.lastConfirmedAt ?? item.createdAt, now)}</span>
        </div>
      </div>
      <button
        onClick={onForget}
        className="shrink-0 inline-flex items-center gap-1.5 text-[10px] text-white/32 hover:text-rose-300 border border-transparent hover:border-rose-500/20 hover:bg-rose-500/[0.06] rounded-md px-2 py-1.5 transition-colors"
        aria-label={`Olvidar ${item.value}`}
      >
        <Trash2 size={12} /> Olvidar
      </button>
    </li>
  );
}

export default function MemoriaView({ state, onForgetItem, openContactId, openRequestId }: Props) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps in the memory list are meant to reflect wall-clock time at render.
  const now = Date.now();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a contact from global search is an external navigation signal (openRequestId), not derivable state.
    if (openContactId) setSelectedId(openContactId);
  }, [openContactId, openRequestId]);

  const allProfiles = selectMemoryProfiles(state);
  const filteredProfiles = useMemo(() => {
    if (!query.trim()) return allProfiles;
    return searchContactMemories(state, query, { includeSensitive: true, limit: 50 }).map((r) => r.profile);
  }, [state, query, allProfiles]);

  const selected = allProfiles.find((p) => p.contactId === selectedId) ?? filteredProfiles[0] ?? null;
  const preferences = selected?.items.filter((item) => item.category === 'preference') ?? [];
  const facts = selected?.items.filter((item) => item.category !== 'preference') ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ViewHeader
        icon={Brain}
        title="Memoria compartida"
        description="Contexto recordado de cada contacto, consolidado entre los canales y agentes autorizados."
        meta={<span className="text-[10px] text-white/35">{allProfiles.length} perfiles</span>}
        guide={{
          title: 'Uso responsable de la memoria',
          items: [
            'Revisa fuente, confianza y sensibilidad antes de utilizar un recuerdo.',
            'Olvidar elimina un hecho concreto y evita que reaparezca al reproducir eventos.',
            'No confundas un resumen generado con una confirmación reciente del contacto.',
          ],
        }}
      />
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
      <div className="lg:w-72 shrink-0 lg:border-r border-white/[0.06] flex flex-col lg:h-full lg:overflow-hidden">
        <div className="px-4 pt-3 pb-2 shrink-0">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar contacto o hecho..."
            className="onyx-input w-full rounded-md px-3 py-2 text-xs"
          />
        </div>

        <div className="flex-1 lg:overflow-y-auto px-2 pb-3 space-y-0.5">
          {filteredProfiles.length === 0 ? (
            <div className="text-xs text-white/30 text-center mt-8 px-3">Sin contactos que coincidan.</div>
          ) : (
            filteredProfiles.map((profile) => {
              const isActive = profile.contactId === selected?.contactId;
              return (
                <button
                  key={profile.contactId}
                  onClick={() => setSelectedId(profile.contactId)}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                    isActive ? 'bg-[#83CFCE]/[0.12] border border-[#8AD3D2]/25' : 'hover:bg-white/[0.035] border border-transparent'
                  }`}
                >
                  <div className="text-xs font-medium text-white/90 truncate">
                    {profile.displayName ?? profile.contactId}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-white/35">
                    <span>
                      {profile.items.length} {profile.items.length === 1 ? 'hecho' : 'hechos'}
                    </span>
                    <span>·</span>
                    <span>{relativeTime(profile.updatedAt, now)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex-1 lg:h-full lg:overflow-y-auto px-6 py-5">
        {!selected ? (
          <div className="text-sm text-white/30 text-center mt-16">Selecciona un contacto para ver su memoria.</div>
        ) : (
          <div className="max-w-2xl space-y-5">
            <div>
              <h3 className="text-white font-semibold text-lg">{selected.displayName ?? selected.contactId}</h3>
              {selected.phoneMasked && <div className="text-xs text-white/40 mt-0.5">{selected.phoneMasked}</div>}
              <div className="flex items-center gap-1.5 mt-2">
                {selectMemorySources(selected).map((source) => (
                  <span
                    key={source}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] ${SOURCE_TW_TEXT[source]}`}
                  >
                    {SOURCE_LABEL_ES[source]}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Resumen</div>
              {selected.summary ? (
                <p className="text-sm text-white/75 leading-relaxed">{selected.summary}</p>
              ) : (
                <div className="text-xs text-white/30">Todavía no hay resumen generado.</div>
              )}
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2.5">Preferencias</div>
              {preferences.length === 0 ? (
                <div className="text-xs text-white/30">Todavía no hay preferencias registradas.</div>
              ) : (
                <ul className="space-y-2">
                  {preferences.map((item) => (
                    <FactRow key={item.id} item={item} now={now} onForget={() => onForgetItem(selected.contactId, item.id)} />
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2.5">Hechos recordados</div>
              {facts.length === 0 ? (
                <div className="text-xs text-white/30">No queda ningún hecho registrado para este contacto.</div>
              ) : (
                <ul className="space-y-2">
                  {facts.map((item) => (
                    <FactRow key={item.id} item={item} now={now} onForget={() => onForgetItem(selected.contactId, item.id)} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
