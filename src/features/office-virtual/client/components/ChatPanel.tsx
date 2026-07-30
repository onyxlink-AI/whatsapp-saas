import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { STATUS_LABEL_ES as STATUS_LABEL } from '../lib/statusStyles';
import type { Agent, ChatMessage } from '../types';

type Props = {
  agent: Agent | null;
  messages: ChatMessage[];
  isTyping: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  onDecideApproval: (approved: boolean) => void;
};

export default function ChatPanel({ agent, messages, isTyping, onClose, onSend, onDecideApproval }: Props) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the draft when the open conversation switches to a different agent.
    setDraft('');
  }, [agent?.id]);

  const submit = () => {
    if (!agent || !draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
  };

  return (
    <AnimatePresence>
      {agent && (
        <motion.aside
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="onyx-chat fixed top-0 right-0 h-full w-full sm:w-[410px] z-[70] flex flex-col isolate"
        >
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.07]">
            <div
              className="w-10 h-10 rounded-md flex items-center justify-center text-xs font-bold border shrink-0"
              style={{
                background: `linear-gradient(145deg, ${agent.color}3d, #091313 70%)`,
                borderColor: agent.color,
              }}
            >
              {agent.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold truncate">{agent.name}</div>
              <div className="text-[11px] text-white/40 truncate">
                {agent.department} · {agent.role} · {STATUS_LABEL[agent.status]}
              </div>
            </div>
            <button
              onClick={onClose}
              className="onyx-icon-button text-white/45 hover:text-white w-8 h-8 transition-colors"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.012]">
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#A0DCDB]/65 mb-1">Canal de agente</div>
            <p className="text-xs leading-relaxed text-white/38">{agent.description}</p>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-white/32 text-center mt-10">
                Escríbele a {agent.name} para empezar la conversación.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-snug whitespace-pre-line border ${
                    m.role === 'user'
                      ? 'bg-[#79CBCA]/90 border-[#8AD3D2]/30 text-[#102828] rounded-br-sm shadow-[0_5px_20px_rgba(57,124,123,.16)]'
                      : 'bg-white/[0.045] border-white/[0.07] text-white/85 rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
                {m.approvalStatus === 'pending' && (
                  <div className="flex gap-2 mt-1.5">
                    <button
                      onClick={() => onDecideApproval(true)}
                      className="text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded-md px-3 py-1 hover:bg-emerald-500/25 transition-colors"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => onDecideApproval(false)}
                      className="text-xs font-medium bg-rose-500/15 text-rose-300 border border-rose-500/40 rounded-md px-3 py-1 hover:bg-rose-500/25 transition-colors"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
                {m.approvalStatus === 'approved' && (
                  <div className="text-[11px] text-emerald-400 mt-1">✓ Aprobado</div>
                )}
                {m.approvalStatus === 'rejected' && <div className="text-[11px] text-rose-400 mt-1">✕ Rechazado</div>}
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white/[0.045] border border-white/[0.07] text-white/40 rounded-lg rounded-bl-sm px-3.5 py-2.5 text-sm flex gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-white/[0.07] flex gap-2 bg-black/25">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={`Escribe a ${agent.name}...`}
              className="onyx-input flex-1 rounded-md px-3.5 py-2.5 text-sm"
            />
            <button
              onClick={submit}
              disabled={!draft.trim()}
              className="bg-[#79CBCA] hover:bg-[#83CFCE] disabled:opacity-40 disabled:hover:bg-[#79CBCA] text-[#102828] rounded-md px-4 text-sm font-semibold transition-colors border border-[#8AD3D2]/25"
            >
              Enviar
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
