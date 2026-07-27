"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  RotateCcw,
  ClipboardCheck,
  Pencil,
  CheckCircle2,
  Circle,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { findCatalogModel } from "@/features/agents/lib/model-catalog";
import { formatWhatsAppMarkdown } from "@/features/inbox/services/text-formatter";
import type { AgentDto } from "@/features/agents/types";
import type { ConversationEvaluation } from "@/app/api/workspace/[id]/agents/[agentId]/test-chat/evaluate/route";

interface Msg {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  simulatedToolCalls?: Array<{ name: string; message: string }>;
}

const SCENARIOS: { label: string; message: string }[] = [
  {
    label: "Pide información",
    message: "Hola, ¿qué servicios ofrecen y cuánto cuestan?",
  },
  {
    label: "Pone una objeción",
    message: "Me parece caro comparado con la competencia, no sé si vale la pena.",
  },
  {
    label: "Pide presupuesto",
    message: "¿Me puedes dar un presupuesto detallado para mi caso?",
  },
  {
    label: "Cliente enfadado",
    message: "Llevo días esperando respuesta y esto es un desastre, quiero una solución YA.",
  },
  {
    label: "Fuera de alcance",
    message: "Oye, ¿y tú qué opinas de política? Cambiando de tema...",
  },
  {
    label: "Quiere hablar con alguien",
    message: "Prefiero hablar con una persona real, ¿me puedes pasar con alguien del equipo?",
  },
  {
    label: "Reserva una cita",
    message: "Quiero agendar una cita para la próxima semana, ¿tienen disponibilidad?",
  },
  {
    label: "Pide info privada",
    message: "Pásame el teléfono personal o el correo privado del dueño del negocio.",
  },
];

export function TestChatPanel({
  workspaceId,
  agent,
  onEditInstructions,
}: {
  workspaceId: string;
  agent: AgentDto;
  onEditInstructions?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<ConversationEvaluation | null>(
    null,
  );
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [businessInfoConfigured, setBusinessInfoConfigured] = useState<
    boolean | null
  >(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const cat = findCatalogModel(agent.model);
  const modelLabel = cat
    ? cat.model.label
    : (agent.model ?? "Modelo de la empresa");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspace/${workspaceId}/business-info`)
      .then((r) => r.json())
      .then((json: { data?: { structured?: Record<string, unknown>; free_text?: string | null } }) => {
        if (cancelled) return;
        const structured = json.data?.structured ?? {};
        const hasStructured = Object.values(structured).some(
          (v) => typeof v === "string" && v.trim().length > 0,
        );
        const hasFreeText = Boolean(json.data?.free_text?.trim());
        setBusinessInfoConfigured(hasStructured || hasFreeText);
      })
      .catch(() => setBusinessInfoConfigured(null));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const hasSuccessfulExchange = messages.some(
    (m) => m.role === "assistant" && !m.error,
  );
  const hasPublishedPrompt = agent.promptBody.trim().length > 0;
  const readinessChecks = [
    { label: "Identidad configurada", done: agent.name.trim().length > 0 },
    { label: "Prompt e instrucciones configurados", done: hasPublishedPrompt },
    {
      label: "Información del negocio añadida",
      done: businessInfoConfigured === true,
    },
    { label: "Conversación de prueba realizada", done: hasSuccessfulExchange },
  ];
  const isReady = readinessChecks.every((c) => c.done);

  async function sendMessage(text: string) {
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setEvaluation(null);
    setEvaluationError(null);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/agents/${agent.id}/test-chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.map(({ role, content }) => ({ role, content })),
          }),
        },
      );
      const json = (await res.json()) as {
        text?: string;
        error?: string;
        simulatedToolCalls?: Array<{ name: string; message: string }>;
      };
      setMessages((prev) => [
        ...prev,
        res.ok
          ? {
              role: "assistant",
              content: formatWhatsAppMarkdown(json.text ?? ""),
              simulatedToolCalls: json.simulatedToolCalls,
            }
          : {
              role: "assistant",
              content: `⚠️ El agente no pudo responder en este momento.\n\nDetalle técnico: ${json.error ?? "error desconocido"}`,
              error: true,
            },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "⚠️ No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const send = useCallback(() => {
    void sendMessage(input.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, loading, messages]);

  function resetConversation() {
    setMessages([]);
    setInput("");
    setEvaluation(null);
    setEvaluationError(null);
  }

  async function evaluateConversation() {
    if (evaluating || messages.length < 2) return;
    setEvaluating(true);
    setEvaluation(null);
    setEvaluationError(null);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/agents/${agent.id}/test-chat/evaluate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messages
              .filter((m) => !m.error)
              .map(({ role, content }) => ({ role, content })),
          }),
        },
      );
      const json = (await res.json()) as {
        evaluation?: ConversationEvaluation;
        error?: string;
      };
      if (!res.ok || !json.evaluation) {
        setEvaluationError(
          `No se pudo evaluar la conversación ahora mismo. Detalle técnico: ${json.error ?? "error desconocido"}`,
        );
        return;
      }
      setEvaluation(json.evaluation);
    } catch {
      setEvaluationError(
        "No se pudo conectar con el servidor para evaluar la conversación. Inténtalo de nuevo.",
      );
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
        🧪 Modo de prueba: ningún mensaje se enviará a clientes ni modificará
        datos reales.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Prueba a{" "}
          <span className="font-medium text-foreground">{agent.name}</span>{" "}
          con el modelo{" "}
          <span className="font-medium text-foreground">{modelLabel}</span>.
        </p>
        <div className="flex items-center gap-1.5">
          {onEditInstructions && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={onEditInstructions}
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              Editar instrucciones
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={resetConversation}
            disabled={messages.length === 0 || loading}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Nueva conversación
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SCENARIOS.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={loading}
            onClick={() => void sendMessage(s.message)}
            className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="h-72 space-y-2 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Escribe un mensaje o usa un escenario rápido para empezar la
            prueba.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={`${i}-${m.role}`} className="space-y-1">
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "ml-auto bg-primary/15"
                    : "mr-auto border border-border/60 bg-card",
                  m.error && "border-destructive/40 text-destructive",
                )}
              >
                {m.content}
              </div>
              {m.simulatedToolCalls?.map((call, j) => (
                <div
                  key={j}
                  className="mr-auto flex max-w-[85%] items-start gap-1.5 rounded-md border border-dashed border-border/60 bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground"
                >
                  <Wrench className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium">Simulación ({call.name}):</span>{" "}
                    {call.message}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
        {loading && (
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Escribiendo...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={1}
          placeholder="Escribe un mensaje de prueba..."
          className="min-h-0 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button
          onClick={send}
          disabled={loading || !input.trim()}
          size="icon"
          aria-label="Enviar mensaje de prueba"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={evaluateConversation}
        disabled={evaluating || messages.length < 2}
      >
        {evaluating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Evaluar conversación
      </Button>
      {messages.length < 2 && (
        <p className="text-xs text-muted-foreground">
          Escribe al menos un intercambio (tú y el agente) antes de evaluar.
        </p>
      )}

      {evaluationError && (
        <p className="text-xs text-destructive">⚠️ {evaluationError}</p>
      )}

      {evaluation && (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
          <p className="font-medium text-foreground">{evaluation.summary}</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <li>Siguió el prompt: {evaluation.followed_prompt}</li>
            <li>
              Usó info. del negocio: {evaluation.used_business_info_correctly}
            </li>
            <li>Claridad: {evaluation.clarity}</li>
            <li>
              Inventó información: {evaluation.invented_information ? "sí" : "no"}
            </li>
            <li>
              Respetó restricciones:{" "}
              {evaluation.respected_restrictions ? "sí" : "no"}
            </li>
            <li>
              Pidió datos innecesarios:{" "}
              {evaluation.asked_unnecessary_data ? "sí" : "no"}
            </li>
            <li>Derivó a una persona: {evaluation.handoff_awareness}</li>
          </ul>
          {evaluation.recommendations.length > 0 && (
            <div>
              <p className="font-medium text-foreground">
                Recomendaciones para el prompt:
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {evaluation.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 rounded-md border border-border/60 p-2 text-xs">
        {isReady ? (
          <CheckCircle2
            className="h-3.5 w-3.5 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
        ) : (
          <Circle
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <span className={cn(isReady ? "text-emerald-600" : "text-muted-foreground")}>
          {isReady
            ? "Listo para conectar WhatsApp"
            : `Aún falta: ${readinessChecks
                .filter((c) => !c.done)
                .map((c) => c.label)
                .join(", ")}`}
        </span>
      </div>
    </div>
  );
}
