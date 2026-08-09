"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHelpAssistantChat } from "@/features/help-assistant/hooks/use-help-assistant-chat";
import { ConfirmationCard } from "./confirmation-card";

interface HelpAssistantPanelProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpAssistantPanel({ workspaceId, open, onOpenChange }: HelpAssistantPanelProps) {
  const { messages, quota, blocked, isPending, sendMessage, resolveConfirmation } = useHelpAssistantChat(workspaceId);
  const [draft, setDraft] = useState("");

  function handleSend() {
    if (blocked) return;
    sendMessage(draft);
    setDraft("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[hsl(var(--electric-lime))]" aria-hidden="true" />
            Asistente de Ayuda
          </SheetTitle>
          <SheetDescription>
            Pregúntame cómo usar el panel de Onyxlink.
          </SheetDescription>
          {quota && (
            <p className="text-xs text-muted-foreground">
              {quota.used}/{quota.limit} preguntas esta semana
            </p>
          )}
        </SheetHeader>

        <ScrollArea className="-mx-6 my-2 flex-1 px-6">
          <div className="space-y-3 pb-2">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Pregúntame cómo usar el panel de Onyxlink — por ejemplo, «¿cómo creo un cliente?» o «¿cómo agrego un negocio al pipeline?».
              </p>
            )}
            {messages.map((message) =>
              message.kind === "confirmation" ? (
                <ConfirmationCard
                  key={message.id}
                  card={message}
                  onResolve={(decision) => resolveConfirmation(message.id, decision)}
                />
              ) : (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    message.role === "user"
                      ? "ml-auto bg-[hsl(var(--electric-lime)/0.15)] text-foreground"
                      : "mr-auto bg-muted text-foreground",
                  )}
                >
                  {message.content}
                </div>
              ),
            )}
            {isPending && (
              <div className="mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                Escribiendo...
              </div>
            )}
            {blocked && quota && (
              <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                Alcanzaste tu límite semanal de preguntas ({quota.limit}). Se reinicia en unos días — mientras tanto, contacta a tu gestor de Onyxlink si es urgente.
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 pt-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={blocked ? "Límite semanal alcanzado" : "Escribe tu pregunta..."}
            disabled={blocked || isPending}
            className="h-9 text-sm"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={blocked || isPending || !draft.trim()}
            aria-label="Enviar pregunta"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
