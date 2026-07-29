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

export function useAgentChat() {
  // useState's lazy initializer (not a ref read during render) is the
  // sanctioned way to build one expensive object per instance — engine is
  // built once per mount and never reassigned.
  const [engine] = useState(() => new OfficeEngine(new InMemoryMemoryStore()));
  const activeRunIdRef = useRef<string | undefined>(undefined);

  const [messagesByAgent, setMessagesByAgent] = useState<Record<string, ChatMessage[]>>({});
  const [typingAgentId, setTypingAgentId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  const sendMessage = useCallback(async (agent: Agent, text: string) => {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, timestamp: Date.now() };
    setMessagesByAgent((prev) => ({ ...prev, [agent.id]: [...(prev[agent.id] ?? []), userMsg] }));
    setTypingAgentId(agent.id);

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
  }, [engine]);

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
