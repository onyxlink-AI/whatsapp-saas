import { useMemo, useState } from 'react';
import { ChevronRight, ContactRound, Search, TriangleAlert } from 'lucide-react';
import { selectContact360List } from '../central-contacts';
import type { Contact360 } from '../central-contacts/types';
import { LEAD_STATUS_LABEL_ES, LEAD_STATUS_TW } from '../lib/leadStatusStyles';
import { relativeTime } from '../lib/relativeTime';
import ViewHeader from './ui/ViewHeader';

type Props = {
  contacts: Contact360[];
  onOpenContact: (contactId: string) => void;
};

export default function ContactosView({ contacts, onOpenContact }: Props) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps in the list are meant to reflect wall-clock time at render.
  const now = Date.now();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => selectContact360List(contacts, { query }), [contacts, query]);
  const attentionCount = contacts.filter((contact) => contact.attentionReasons.length > 0).length;

  return (
    <div className="h-full flex flex-col">
      <ViewHeader
        icon={ContactRound}
        title="Contactos"
        description="Perfil unificado de cada lead con sus conversaciones, memoria, tareas y situación comercial."
        meta={
          <div className="flex items-center gap-3 text-[10px] text-white/35">
            <span>{contacts.length} contactos</span>
            {attentionCount > 0 && <span className="text-amber-300/70">{attentionCount} requieren atención</span>}
          </div>
        }
        guide={{
          title: 'Cómo priorizar contactos',
          items: [
            'El aviso ámbar identifica perfiles con una situación pendiente de revisión.',
            'La etapa indica el punto actual del lead dentro del proceso comercial.',
            'Abre el perfil 360 antes de contactar para revisar contexto y memoria compartida.',
          ],
        }}
      />

      <div className="px-4 sm:px-6 py-3 shrink-0 border-b border-white/[0.06] flex items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="onyx-input w-full rounded-md pl-9 pr-3 py-2.5 text-xs"
          />
        </div>
        <span className="hidden sm:block text-[11px] text-white/30">{filtered.length} resultados</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {filtered.length === 0 ? (
          <div className="text-sm text-white/30 text-center mt-12">Sin contactos que coincidan.</div>
        ) : (
          <ul className="space-y-2 max-w-5xl">
            {filtered.map((contact) => (
              <li key={contact.contactId}>
                <button
                  onClick={() => onOpenContact(contact.contactId)}
                  className="onyx-contact-row w-full flex items-center gap-3 text-left px-3.5 py-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 bg-white/[0.05] text-white/70 border border-white/[0.08]">
                    {contact.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white/90 truncate">{contact.displayName}</div>
                    <div className="text-[11px] text-white/40 truncate">{contact.phoneMasked}</div>
                  </div>
                  {contact.attentionReasons.length > 0 && (
                    <span className="hidden md:flex items-center gap-1.5 text-[10px] text-amber-300/75 shrink-0" title="Requiere atención">
                      <TriangleAlert size={13} /> Revisar
                    </span>
                  )}
                  <span className="text-[10px] text-white/50 shrink-0 hidden sm:inline">
                    {relativeTime(contact.latestActivityAt, now)}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${LEAD_STATUS_TW[contact.stage]}`}
                  >
                    {LEAD_STATUS_LABEL_ES[contact.stage]}
                  </span>
                  <ChevronRight size={15} className="text-white/20 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
