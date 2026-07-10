"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEAL_STAGE_LABELS, type DealWithContact } from "@/features/pipeline/types";
import { getDeal } from "@/features/pipeline/services/deal-actions";
import {
  createDealFromSuggestion,
  dismissContactDealSuggestion,
  type ContactDealSuggestion,
} from "@/features/pipeline/services/deal-suggestion-actions";

interface Props {
  initialSuggestions: ContactDealSuggestion[];
  onDealCreated: (deal: DealWithContact) => void;
}

// "Sugerencias de IA: crear deal" — contacts with no deal yet that
// pipeline-suggestion.ts flagged as a real sales opportunity. Nothing is
// created until the human clicks "Crear deal".
export function PipelineSuggestionsBanner({
  initialSuggestions,
  onDealCreated,
}: Props) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [isPending, startTransition] = useTransition();

  if (suggestions.length === 0) return null;

  function handleCreate(contactId: string) {
    startTransition(async () => {
      const result = await createDealFromSuggestion(contactId);
      if (result.ok) {
        setSuggestions((prev) => prev.filter((s) => s.contactId !== contactId));
        const created = await getDeal(result.data.id);
        if (created) onDealCreated(created);
        toast.success("Deal creado");
      } else {
        toast.error(result.error ?? "Error al crear el deal");
      }
    });
  }

  function handleDismiss(contactId: string) {
    startTransition(async () => {
      const result = await dismissContactDealSuggestion(contactId);
      if (result.ok) {
        setSuggestions((prev) => prev.filter((s) => s.contactId !== contactId));
      } else {
        toast.error(result.error ?? "Error al descartar la sugerencia");
      }
    });
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--electric-lime)/0.4)] bg-[hsl(var(--electric-lime)/0.06)] p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--electric-lime))]">
        <Sparkles className="h-3.5 w-3.5" />
        Sugerencias de IA — contactos sin deal
      </p>
      <div className="flex flex-col gap-1.5">
        {suggestions.map((s) => (
          <div
            key={s.contactId}
            className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">
                {s.name || s.phone}
                <span className="ml-2 text-[10px] text-muted-foreground">
                  → {DEAL_STAGE_LABELS[s.stage]}
                </span>
              </p>
              {s.reason && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {s.reason}
                </p>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button
                type="button"
                size="sm"
                className="h-6 text-[10px] gap-1"
                disabled={isPending}
                onClick={() => handleCreate(s.contactId)}
              >
                <Check className="h-3 w-3" />
                Crear deal
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1"
                disabled={isPending}
                onClick={() => handleDismiss(s.contactId)}
              >
                <X className="h-3 w-3" />
                Descartar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
