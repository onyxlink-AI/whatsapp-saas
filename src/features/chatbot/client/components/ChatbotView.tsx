"use client";

import { useState } from "react";
import { Bot, Brain, MessageCircle, Plus, Send, ShieldCheck, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { useChatbotFeed } from "../hooks/useChatbotFeed";
import type { ChatbotProvider } from "../../types";

type Props = { workspaceId: string };

const STATUS_LABEL: Record<string, string> = { draft: "Borrador", published: "Publicado" };
const PROVIDER_LABEL: Record<ChatbotProvider, string> = { whatsapp: "WhatsApp", telegram: "Telegram" };

function newFaqId() {
  return `faq-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ChatbotView({ workspaceId }: Props) {
  const feed = useChatbotFeed(workspaceId);
  const [testQuestion, setTestQuestion] = useState("");

  if (feed.loading) {
    return <div className="page-shell text-sm text-muted-foreground">Preparando el Chatbot…</div>;
  }
  if (feed.loadError) {
    return <div className="page-shell text-sm text-destructive">{feed.loadError}</div>;
  }

  const { draft, channels } = feed;
  const canPublish = Boolean(
    draft.name.trim() &&
      draft.purpose.trim() &&
      draft.instructions.trim() &&
      draft.fallbackMessage.trim() &&
      draft.model.trim() &&
      draft.faqs.some((faq) => faq.question.trim() && faq.answer.trim()),
  );

  const addFaq = () => feed.patchDraft({ faqs: [...draft.faqs, { id: newFaqId(), question: "", answer: "" }] });
  const updateFaq = (id: string, patch: Partial<{ question: string; answer: string }>) =>
    feed.patchDraft({ faqs: draft.faqs.map((faq) => (faq.id === id ? { ...faq, ...patch } : faq)) });
  const removeFaq = (id: string) => feed.patchDraft({ faqs: draft.faqs.filter((faq) => faq.id !== id) });

  const submitTest = () => {
    const question = testQuestion.trim();
    if (!question) return;
    void feed.testQuestion(question);
  };

  return (
    <div className="page-shell max-w-[88rem] space-y-7">
      <PageHeader
        eyebrow="Canales automáticos"
        title="Chatbot"
        description="Prepara respuestas fiables para WhatsApp o Telegram sin memoria ni acciones sobre tu empresa."
        actions={
          <>
            <Badge variant={feed.status === "published" ? "default" : "secondary"}>{STATUS_LABEL[feed.status]}</Badge>
            {feed.enabled && <Badge variant="outline">Activo</Badge>}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1. Para quién responde</CardTitle>
              <CardDescription>Elige un uso sencillo — solo cambia el tono y quién puede acceder.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["external_faq", "🌍 Clientes", "Responde preguntas habituales sobre productos, servicios o atención."],
                    ["internal_faq", "🏢 Equipo interno", "Resuelve dudas frecuentes de trabajadores sobre procesos de la empresa."],
                  ] as const
                ).map(([value, label, description]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => feed.patchDraft({ useCase: value })}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      draft.useCase === value ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <div className="text-sm font-medium text-foreground">{label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{description}</div>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nombre visible</Label>
                  <Input value={draft.name} onChange={(e) => feed.patchDraft({ name: e.target.value })} placeholder="Ej. Ayuda Acme" />
                </div>
                <div className="space-y-1.5">
                  <Label>Su única función</Label>
                  <Input value={draft.purpose} onChange={(e) => feed.patchDraft({ purpose: e.target.value })} placeholder="Ej. Resolver dudas sobre pedidos" />
                </div>
              </div>

              {draft.useCase === "internal_faq" && (
                <div className="space-y-1.5">
                  <Label>Quién puede utilizarlo</Label>
                  <Input value={draft.accessNote} onChange={(e) => feed.patchDraft({ accessNote: e.target.value })} placeholder="Ej. Solo el equipo interno" />
                  <p className="text-xs text-muted-foreground">Nota informativa — el acceso real lo controla el canal conectado (número o bot).</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Qué debe responder</CardTitle>
              <CardDescription>Instrucciones sencillas y las preguntas más habituales.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Instrucciones</Label>
                <Textarea
                  value={draft.instructions}
                  onChange={(e) => feed.patchDraft({ instructions: e.target.value })}
                  rows={4}
                  placeholder="Responde de forma breve y amable. Utiliza solo la información facilitada. Si no conoces algo, deriva a una persona."
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preguntas y respuestas</div>
                  <p className="text-xs text-muted-foreground">La IA las usa como fuente principal.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addFaq}>
                  <Plus className="h-3.5 w-3.5" /> Añadir pregunta
                </Button>
              </div>

              <div className="space-y-2.5">
                {draft.faqs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    Todavía no hay preguntas frecuentes. Añade la primera para que el chatbot tenga una respuesta fiable.
                  </div>
                ) : (
                  draft.faqs.map((faq, index) => (
                    <div key={faq.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1.35fr_auto]">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Pregunta {index + 1}</Label>
                        <Input value={faq.question} onChange={(e) => updateFaq(faq.id, { question: e.target.value })} placeholder="¿Cuál es vuestro horario?" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Respuesta</Label>
                        <Input value={faq.answer} onChange={(e) => updateFaq(faq.id, { answer: e.target.value })} placeholder="Atendemos de lunes a viernes…" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="mt-5" onClick={() => removeFaq(faq.id)} aria-label={`Eliminar pregunta ${index + 1}`}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Cuando no conozca la respuesta</Label>
                <Input value={draft.fallbackMessage} onChange={(e) => feed.patchDraft({ fallbackMessage: e.target.value })} placeholder="No tengo esa información. Consulta con una persona del equipo." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Modelo y canal</CardTitle>
              <CardDescription>OpenRouter aporta la inteligencia. WhatsApp o Telegram transportan los mensajes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Modelo (OpenRouter)</Label>
                <Input value={draft.model} onChange={(e) => feed.patchDraft({ model: e.target.value })} placeholder="openai/gpt-4o-mini" />
                <p className="text-xs text-muted-foreground">Usa la conexión OpenRouter ya configurada en Settings → Integraciones.</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <ChannelCard
                  icon={<MessageCircle className="h-4 w-4" />}
                  label="WhatsApp"
                  detail="Usa el número YCloud de la empresa, sin activar el Agente de WhatsApp."
                  selected={feed.channelProvider === "whatsapp"}
                  eligible={channels.whatsapp.eligible}
                  reason={channels.whatsapp.reason}
                  onSelect={() => void feed.selectChannel("whatsapp")}
                />
                <ChannelCard
                  icon={<Send className="h-4 w-4" />}
                  label="Telegram"
                  detail="Conecta un bot de Telegram para clientes o trabajadores."
                  selected={feed.channelProvider === "telegram"}
                  eligible={channels.telegram.eligible}
                  reason={channels.telegram.reason}
                  onSelect={() => void feed.selectChannel("telegram")}
                />
              </div>

              {feed.channelProvider && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
                  <span>Canal activo: {PROVIDER_LABEL[feed.channelProvider]}</span>
                  <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => void feed.selectChannel(null)}>
                    Quitar canal
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">🤖 Chatbot</div>
              {[
                [Brain, "Sin memoria", "No recuerda conversaciones ni personas."],
                [ShieldCheck, "Sin acciones", "No toca CRM, tareas, agenda ni herramientas."],
                [Zap, "Solo respuestas", "Contesta y deriva cuando no sabe algo."],
              ].map(([Icon, title, description]) => {
                const ItemIcon = Icon as typeof Brain;
                return (
                  <div key={title as string} className="flex items-start gap-2.5 rounded-md bg-muted/40 p-2.5">
                    <ItemIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <div className="text-xs font-medium text-foreground">{title as string}</div>
                      <div className="text-xs text-muted-foreground">{description as string}</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Probar antes de publicar</CardTitle>
              <CardDescription>Comprueba una pregunta como si fueras el usuario.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea value={testQuestion} onChange={(e) => setTestQuestion(e.target.value)} rows={3} placeholder="Escribe una pregunta de prueba…" />
              <Button type="button" className="w-full" disabled={!testQuestion.trim() || feed.testing} onClick={submitTest}>
                <Send className="h-3.5 w-3.5" /> {feed.testing ? "Probando…" : "Probar respuesta"}
              </Button>
              {feed.testResult && (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Respuesta del chatbot</div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground">{feed.testResult.answer}</p>
                  <div className="mt-1.5 text-[10px] text-muted-foreground">Fuente: {feed.testResult.source === "openrouter" ? "modelo de IA" : "respuesta de seguridad"}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between gap-3 pt-6">
              <div>
                <div className="text-sm font-medium text-foreground">Visible en la oficina</div>
                <div className="text-xs text-muted-foreground">
                  {feed.status !== "published"
                    ? "Publica primero el chatbot."
                    : !feed.channelProvider
                      ? "Elige un canal primero."
                      : feed.enabled
                        ? "El trabajador aparece en su despacho."
                        : "El despacho está vacío."}
                </div>
              </div>
              <Switch
                checked={feed.enabled}
                disabled={feed.status !== "published" || !feed.channelProvider}
                onCheckedChange={(checked) => void feed.setEnabled(checked)}
              />
            </CardContent>
          </Card>

          {feed.lastResult && feed.lastResult.status === "error" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{feed.lastResult.message}</div>
          )}

          <Button className="w-full" disabled={!canPublish || feed.saving} onClick={() => void feed.publish()}>
            <Bot className="h-4 w-4" /> {feed.status === "published" ? "Publicar nueva versión" : "Publicar chatbot"}
          </Button>
          <p className="text-center text-[10px] text-muted-foreground">🔒 Chatbot privado de esta empresa</p>
        </aside>
      </div>
    </div>
  );
}

function ChannelCard({
  icon,
  label,
  detail,
  selected,
  eligible,
  reason,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  selected: boolean;
  eligible: boolean;
  reason: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!eligible && !selected}
      title={!eligible && !selected ? (reason ?? undefined) : undefined}
      className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{!eligible && !selected ? reason : detail}</div>
    </button>
  );
}
