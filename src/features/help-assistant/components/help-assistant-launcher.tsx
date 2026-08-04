"use client";

import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpAssistantPanel } from "./help-assistant-panel";

interface HelpAssistantLauncherProps {
  workspaceId: string;
}

/**
 * Mounted once in (main)/layout.tsx's header, next to Búsqueda/Candado/Tema
 * — visible on every page across Panel de Gestión and Oficina Virtual.
 *
 * Fase 1 del roadmap comercial: antes era un botón flotante inferior; ahora
 * vive en la barra superior (icono siempre, texto "Asistente" cuando hay
 * espacio en escritorio) para no competir con la navegación inferior móvil
 * ni tapar contenido.
 */
export function HelpAssistantLauncher({ workspaceId }: HelpAssistantLauncherProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Abrir el Asistente de Ayuda"
        aria-expanded={open}
        title="Asistente de ayuda"
        className="gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <MessageCircleQuestion className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden lg:inline">Asistente</span>
      </Button>
      <HelpAssistantPanel workspaceId={workspaceId} open={open} onOpenChange={setOpen} />
    </>
  );
}
