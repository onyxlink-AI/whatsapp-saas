"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WhiteboardConflictBannerProps {
  conflictingCount: number;
  onReloadRemote: () => void;
  onKeepMyChanges: () => void;
  resolving: boolean;
}

/**
 * Fase 4C: "sin pérdida silenciosa" — se muestra cuando el MISMO elemento
 * cambió a la vez en local y en el servidor (típicamente el Asistente de
 * Ayuda). El autoguardado queda en pausa mientras esto está visible —
 * nunca recarga ni pisa nada por su cuenta, la decisión es del usuario.
 */
export function WhiteboardConflictBanner({ conflictingCount, onReloadRemote, onKeepMyChanges, resolving }: WhiteboardConflictBannerProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm dark:border-amber-900/60 dark:bg-amber-950/40">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">
        {conflictingCount === 1
          ? "Un elemento cambió aquí y también en otro lugar (probablemente el Asistente de Ayuda) al mismo tiempo. El autoguardado está en pausa."
          : `${conflictingCount} elementos cambiaron aquí y también en otro lugar al mismo tiempo. El autoguardado está en pausa.`}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onReloadRemote} disabled={resolving}>
          Recargar cambios remotos
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={onKeepMyChanges} disabled={resolving}>
          Conservar mis cambios
        </Button>
      </div>
    </div>
  );
}
