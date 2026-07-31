import { useCallback, useRef, useState } from 'react';
import { InMemoryMemoryStore } from '../../memory/in-memory-store';
import { OfficeEngine } from '../../orchestrator/engine';
import { formatOfficeReply } from '../lib/formatOfficeReply';
import type { AgentId } from '../../schemas';
import type { Agent, ChatMessage } from '../types';

// One office = one run of the pipeline per hook instance (i.e. per mounted
// OfficeVirtualApp, one per workspace) — memory/engine/activeRunId used to
// live at module scope, which meant every workspace sharing this browser tab
// silently shared the same in-memory store and the same "active run", so a
// lead started in workspace A could resume in workspace B. The engine is
// now built once per instance (useState's lazy initializer) and activeRunId
// lives in a ref, so remounting OfficeVirtualApp with key={workspaceId}
// (see the route page) always starts a clean engine.
// Kept in-memory only — this block ports the UI into the SaaS panel but does
// not wire real prompt execution or persistence; SupabaseMemoryStore
// (memory/supabase-store.ts) is still available for whoever picks up that
// real-execution block later.

export type PendingApproval = { agentId: AgentId; description: string };

/** Plain string split, never `new Date(...)` — parsing "YYYY-MM-DD" through Date shifts a day depending on the browser's local timezone. */
function formatScheduledDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

type CoordinatorChatResponse = {
  coordinatorText: string;
  delegation:
    | {
        agentId: string;
        specialistName: string;
        text: string;
        agendaTask:
          | { title: string; scheduledDate: string; startTime: string | null; endTime: string | null; meetingLink: string | null }
          | null;
      }
    | null;
};

/**
 * `workspaceId`/`realChat` gate the ONE real path in this hook: talking to
 * the Coordinador (agent.id === 'coordinator') outside demo mode calls
 * src/app/api/workspace/[id]/office-virtual/chat (real-chat-service.ts) —
 * a genuine OpenRouter call using the model configured in Orquestador →
 * Modelos de especialistas, which may delegate to a real published
 * specialist. Every other agent (WhatsApp/Voice/the 4 legacy roles) still
 * runs through OfficeEngine's in-memory simulation — wiring those up to a
 * real model is the next, separate piece of work.
 */
export function useAgentChat(workspaceId: string, realChat: boolean) {
  // useState's lazy initializer (not a ref read during render) is the
  // sanctioned way to build one expensive object per instance — engine is
  // built once per mount and never reassigned.
  const [engine] = useState(() => new OfficeEngine(new InMemoryMemoryStore()));
  const activeRunIdRef = useRef<string | undefined>(undefined);

  const [messagesByAgent, setMessagesByAgent] = useState<Record<string, ChatMessage[]>>({});
  const [typingAgentId, setTypingAgentId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  const sendCoordinatorMessage = useCallback(async (agent: Agent, priorMessages: ChatMessage[]) => {
    try {
      const history = priorMessages
        .filter((m) => !m.approvalRequestId)
        .slice(-20)
        .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }));
      const lastUserText = priorMessages[priorMessages.length - 1]?.text ?? '';

      const response = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/office-virtual/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lastUserText, history: history.slice(0, -1) }),
      });
      const body = (await response.json().catch(() => null)) as (CoordinatorChatResponse & { error?: string }) | null;

      if (!response.ok || !body) {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'agent',
          text: `⚠️ ${body?.error ?? 'No se pudo hablar con el Orquestador.'}`,
          timestamp: Date.now(),
        };
        setMessagesByAgent((prev) => ({ ...prev, [agent.id]: [...(prev[agent.id] ?? []), errorMsg] }));
        return;
      }

      const replies: ChatMessage[] = [
        { id: crypto.randomUUID(), role: 'agent', text: body.coordinatorText, timestamp: Date.now() },
      ];
      if (body.delegation) {
        replies.push({
          id: crypto.randomUUID(),
          role: 'agent',
          text: `🔧 ${body.delegation.specialistName} responde:\n\n${body.delegation.text}`,
          timestamp: Date.now(),
        });
        if (body.delegation.agendaTask) {
          const { title, scheduledDate, startTime, endTime, meetingLink } = body.delegation.agendaTask;
          const time = startTime ? ` a las ${startTime}${endTime ? `–${endTime}` : ''}` : '';
          const link = meetingLink ? `\n🔗 Enlace de la reunión: ${meetingLink}` : '';
          replies.push({
            id: crypto.randomUUID(),
            role: 'agent',
            text: `📅 Guardado en tu Agenda: "${title}" — ${formatScheduledDate(scheduledDate)}${time}${link}`,
            timestamp: Date.now(),
          });
        }
      }
      setMessagesByAgent((prev) => ({ ...prev, [agent.id]: [...(prev[agent.id] ?? []), ...replies] }));
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        text: '⚠️ No se pudo contactar con el backend del Orquestador.',
        timestamp: Date.now(),
      };
      setMessagesByAgent((prev) => ({ ...prev, [agent.id]: [...(prev[agent.id] ?? []), errorMsg] }));
    } finally {
      setTypingAgentId((current) => (current === agent.id ? null : current));
    }
  }, [workspaceId]);

  const sendMessage = useCallback(async (agent: Agent, text: string) => {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, timestamp: Date.now() };
    let nextMessages: ChatMessage[] = [];
    setMessagesByAgent((prev) => {
      nextMessages = [...(prev[agent.id] ?? []), userMsg];
      return { ...prev, [agent.id]: nextMessages };
    });
    setTypingAgentId(agent.id);

    if (realChat && agent.id === 'coordinator') {
      await sendCoordinatorMessage(agent, nextMessages);
      return;
    }

    await new Promise((r) => setTimeout(r, 350 + Math.random() * 400)); // feels like the character is "typing"

    const result = await engine.handleAgentMessage(agent.id, text, activeRunIdRef.current);
    activeRunIdRef.current = result.runId;

    const agentMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'agent',
      text: formatOfficeReply(agent.id, result.output),
      timestamp: Date.now(),
      approvalRequestId: result.approvalRequestId,
      approvalStatus: result.approvalRequestId ? 'pending' : undefined,
    };
    setMessagesByAgent((prev) => ({ ...prev, [agent.id]: [...(prev[agent.id] ?? []), agentMsg] }));
    setTypingAgentId((current) => (current === agent.id ? null : current));
    if (result.approvalRequestId) {
      setPendingApproval({ agentId: agent.id, description: agentMsg.text });
    }
  }, [engine, realChat, sendCoordinatorMessage]);

  const decideApproval = useCallback(async (agent: Agent, approved: boolean) => {
    if (!activeRunIdRef.current) return;
    await engine.decideApproval(activeRunIdRef.current, approved);
    setPendingApproval(null);

    setMessagesByAgent((prev) => {
      const list = prev[agent.id] ?? [];
      const updated = list.map((m) =>
        m.approvalStatus === 'pending' ? { ...m, approvalStatus: approved ? ('approved' as const) : ('rejected' as const) } : m,
      );
      const decisionMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        text: approved
          ? '✅ Aprobado. El run pasa a Operaciones.'
          : '❌ Rechazado. El run queda bloqueado hasta revisión.',
        timestamp: Date.now(),
      };
      return { ...prev, [agent.id]: [...updated, decisionMsg] };
    });
  }, [engine]);

  return { messagesByAgent, sendMessage, decideApproval, typingAgentId, pendingApproval };
}
