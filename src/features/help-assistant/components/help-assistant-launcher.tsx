"use client";

import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { HelpAssistantPanel } from "./help-assistant-panel";

interface HelpAssistantLauncherProps {
  workspaceId: string;
}

/** Mounted once in (main)/layout.tsx — floats on every page across Panel de Gestión and Oficina Virtual. */
export function HelpAssistantLauncher({ workspaceId }: HelpAssistantLauncherProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir el Asistente de Ayuda"
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--electric-lime))] text-black shadow-lg transition-transform hover:scale-105 lg:bottom-6 lg:right-6"
      >
        <MessageCircleQuestion className="h-5 w-5" aria-hidden="true" />
      </button>
      <HelpAssistantPanel workspaceId={workspaceId} open={open} onOpenChange={setOpen} />
    </>
  );
}
