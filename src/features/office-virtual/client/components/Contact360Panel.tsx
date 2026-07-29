import { AnimatePresence, motion } from 'framer-motion';
import type { Contact360 } from '../central-contacts/types';
import { ATTENTION_REASON_LABEL_ES, CONVERSATION_STATE_LABEL_ES } from '../lib/conversationStateStyles';
import { LEAD_STATUS_LABEL_ES, LEAD_STATUS_TW } from '../lib/leadStatusStyles';
import { relativeTime } from '../lib/relativeTime';

type Props = {
  contact: Contact360 | null;
  onClose: () => void;
};

const DEAL_STAGE_LABEL_ES: Record<NonNullable<Contact360['deal']>['stage'], string> = {
  new: 'Nueva',
  contacted: 'Contactada',
  proposal_sent: 'Propuesta enviada',
  negotiation: 'Negociación',
  won: 'Ganada',
  lost: 'Perdida',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">{title}</div>
      {children}
    </div>
  );
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} min ${rest}s` : `${rest}s`;
}

export default function Contact360Panel({ contact, onClose }: Props) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps in the panel are meant to reflect wall-clock time at render.
  const now = Date.now();

  return (
    <AnimatePresence>
      {contact && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="onyx-popover w-full max-w-2xl my-auto"
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/[0.07]">
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.18em] text-violet-300/60 mb-1">Contacto 360</div>
                <h3 className="text-white font-semibold text-lg truncate">{contact.displayName}</h3>
                <div className="text-xs text-white/40 mt-0.5">
                  {contact.phoneMasked}
                  {contact.emailMasked && <span> · {contact.emailMasked}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${LEAD_STATUS_TW[contact.stage]}`}>
                    {LEAD_STATUS_LABEL_ES[contact.stage]}
                  </span>
                  {contact.deal ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-white/60">
                      {contact.deal.title} · {DEAL_STAGE_LABEL_ES[contact.deal.stage]} · {contact.deal.value} {contact.deal.currency}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-white/40">
                      Sin oportunidad todavía
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="onyx-icon-button shrink-0 text-white/45 hover:text-white w-8 h-8 transition-colors"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid sm:grid-cols-2 gap-4">
                <Section title="Última conversación de WhatsApp">
                  {contact.whatsapp ? (
                    <div>
                      <p className="text-sm text-white/75 leading-relaxed">
                        {contact.whatsapp.lastMessagePreview ?? 'Sin mensajes todavía.'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-white/35">
                        {contact.whatsapp.lastMessageAt && <span>{relativeTime(contact.whatsapp.lastMessageAt, now)}</span>}
                        <span>·</span>
                        <span className="text-white/45">{CONVERSATION_STATE_LABEL_ES[contact.whatsapp.state]}</span>
                        {contact.whatsapp.unreadCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-300/80">{contact.whatsapp.unreadCount} sin leer</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-white/30">Sin conversaciones de WhatsApp todavía.</div>
                  )}
                </Section>
                <Section title="Última llamada de voz">
                  {contact.voice ? (
                    <div>
                      <p className="text-sm text-white/75 leading-relaxed">{contact.voice.summary ?? 'Sin resumen todavía.'}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-white/35">
                        {contact.voice.startedAt && <span>{relativeTime(contact.voice.startedAt, now)}</span>}
                        {formatDuration(contact.voice.durationSeconds) && (
                          <>
                            <span>·</span>
                            <span>{formatDuration(contact.voice.durationSeconds)}</span>
                          </>
                        )}
                        {contact.voice.endedReason && (
                          <>
                            <span>·</span>
                            <span className="text-white/45">{contact.voice.endedReason}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-white/30">Sin llamadas de voz todavía.</div>
                  )}
                </Section>
              </div>

              <Section title="Memoria compartida">
                {contact.memory?.summary ? (
                  <p className="text-sm text-white/75 leading-relaxed">{contact.memory.summary}</p>
                ) : (
                  <div className="text-xs text-white/30">Todavía no hay memoria registrada para este contacto.</div>
                )}
              </Section>

              <div className="grid sm:grid-cols-3 gap-4">
                <Section title="Objeciones">
                  {!contact.memory?.objections.length ? (
                    <div className="text-xs text-white/30">Ninguna registrada.</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {contact.memory.objections.map((objection) => (
                        <li key={objection} className="text-xs text-white/70 leading-relaxed">
                          {objection}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
                <Section title="Preferencias">
                  {!contact.memory || Object.keys(contact.memory.preferences).length === 0 ? (
                    <div className="text-xs text-white/30">Ninguna registrada.</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {Object.entries(contact.memory.preferences).map(([key, value]) => (
                        <li key={key} className="text-xs text-white/70 leading-relaxed">
                          <span className="text-white/40">{key}:</span> {String(value)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
                <Section title="Intereses">
                  {!contact.memory?.interests.length ? (
                    <div className="text-xs text-white/30">Ninguno registrado.</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {contact.memory.interests.map((interest) => (
                        <li key={interest} className="text-xs text-white/70 leading-relaxed">
                          {interest}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

              <div className="rounded-lg border border-violet-400/25 bg-violet-500/[0.05] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/70 mb-1.5">
                  Próximo paso recomendado
                </div>
                <p className="text-sm text-white/85 leading-relaxed">
                  {contact.nextAction ?? 'Sin recomendación todavía.'}
                </p>
              </div>

              <Section title="Alertas, handoff y tareas pendientes">
                <div className="space-y-3">
                  {contact.attentionReasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {contact.attentionReasons.map((reason) => (
                        <span
                          key={reason}
                          className="text-[11px] font-medium px-2.5 py-1 rounded-full border text-amber-300 border-amber-500/30 bg-amber-500/[0.06]"
                        >
                          {ATTENTION_REASON_LABEL_ES[reason] ?? reason}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        contact.whatsapp?.state === 'handoff_pending' ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                    <span className="text-white/60">
                      {contact.whatsapp?.state === 'handoff_pending'
                        ? 'Handoff a humano activo'
                        : 'Sin handoff activo — la IA sigue al mando'}
                    </span>
                  </div>

                  <div className="text-xs text-white/60">
                    {contact.pendingTasks === 0
                      ? 'Sin tareas pendientes.'
                      : `${contact.pendingTasks} tarea${contact.pendingTasks === 1 ? '' : 's'} pendiente${contact.pendingTasks === 1 ? '' : 's'}.`}
                  </div>
                </div>
              </Section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
