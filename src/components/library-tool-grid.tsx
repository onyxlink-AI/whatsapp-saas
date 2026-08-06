"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Fase 1 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md, §3):
// patrón de "biblioteca" compartido por Proyectos y Contenido — un grid de
// tarjetas compactas que navegan a una herramienta a pantalla completa, en
// vez de pestañas siempre visibles. Reutiliza los tokens ya establecidos
// (surface-card, border-border/60) en vez de inventar otro lenguaje visual.

export interface LibraryToolItem {
  view: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface LibraryToolGridProps {
  items: LibraryToolItem[];
  onSelect: (view: string) => void;
}

export function LibraryToolGrid({ items, onSelect }: LibraryToolGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.view}
          type="button"
          onClick={() => onSelect(item.view)}
          className="surface-card flex min-h-[44px] flex-col items-start gap-2 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <item.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span className="font-display text-sm font-semibold text-foreground">{item.label}</span>
          <span className="text-xs text-muted-foreground">{item.description}</span>
        </button>
      ))}
    </div>
  );
}

interface LibraryBackButtonProps {
  label: string;
  onClick: () => void;
}

// ≥44px de alto (criterio táctil móvil del encargo) y con el texto de
// destino visible, no solo un icono — más claro que la flecha suelta de
// 32px que ya usan whiteboard-editor.tsx/note-editor.tsx para "volver al
// editor" (un caso distinto: aquí se vuelve a un grid de herramientas).
export function LibraryBackButton({ label, onClick }: LibraryBackButtonProps) {
  return (
    <Button variant="ghost" onClick={onClick} className="-ml-3 h-11 w-fit gap-2 px-3">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
