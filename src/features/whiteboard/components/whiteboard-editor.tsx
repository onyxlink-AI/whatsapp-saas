"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, HelpCircle, StickyNote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  renameWhiteboard,
  updateWhiteboardScene,
} from "@/features/whiteboard/services/whiteboard-actions";
import type { WhiteboardRow } from "@/features/whiteboard/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

// Excalidraw touches the canvas/window APIs at import time — it can only
// ever run in the browser, never during SSR/static generation.
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
);

const TIPS = [
  "Doble clic dentro de una nota o forma para escribir — el texto se centra solo.",
  "Selecciona una forma para cambiar su color, relleno y grosor del borde en el panel de la izquierda.",
  "Acerca una flecha al borde de una forma: se queda pegada sola, y la sigue si la mueves.",
  "Arrastra una forma cerca de otra y aparecen guías rosas para alinearlas solas.",
  "Usa \"+ Nota adhesiva\" para añadir un post-it listo para escribir en un clic.",
];

// Only the handful of appState fields worth persisting across reloads — the
// rest (collaborators, which is a non-serializable Map, cursor position,
// which panel is open, etc.) is either transient UI state or not JSON-safe.
const PERSISTABLE_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "zoom",
  "scrollX",
  "scrollY",
  "gridSize",
] as const;

function pickPersistableAppState(
  appState: Record<string, unknown>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of PERSISTABLE_APP_STATE_KEYS) {
    if (key in appState) picked[key] = appState[key];
  }
  return picked;
}

const SAVE_DEBOUNCE_MS = 2000;

interface Props {
  board: WhiteboardRow;
}

export function WhiteboardEditor({ board }: Props) {
  const [name, setName] = useState(board.name);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // One-click sticky note: a ready-to-type post-it instead of the manual
  // "pick rectangle → draw it → double-click → change color" dance.
  async function handleAddStickyNote() {
    const api = excalidrawApiRef.current;
    if (!api) return;

    const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
    const appState = api.getAppState();
    const width = 220;
    const height = 160;
    const x = -appState.scrollX + appState.width / 2 / appState.zoom.value - width / 2;
    const y = -appState.scrollY + appState.height / 2 / appState.zoom.value - height / 2;

    const created = convertToExcalidrawElements([
      {
        type: "rectangle",
        x,
        y,
        width,
        height,
        backgroundColor: "#fff3a3",
        strokeColor: "#e0c341",
        fillStyle: "solid",
        roundness: { type: 3 },
        label: { text: "", fontSize: 20, textAlign: "center", verticalAlign: "middle" },
      },
    ]);
    const container = created.find((el) => el.type === "rectangle");
    const label = created.find((el) => el.type === "text");
    if (!container) return;

    api.updateScene({
      elements: [...api.getSceneElements(), ...created],
      appState: {
        selectedElementIds: { [container.id]: true },
        editingTextElement: label ?? null,
      },
    });
  }

  function handleSceneChange(elements: readonly unknown[], appState: unknown) {
    setSaveState("unsaved");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setSaveState("saving");
      startTransition(async () => {
        const result = await updateWhiteboardScene(board.id, {
          elements: [...elements],
          appState: pickPersistableAppState(appState as Record<string, unknown>),
        });
        if (!result.ok) {
          setSaveState("unsaved");
          toast.error(result.error ?? "Error al guardar el tablero");
          return;
        }
        setSaveState("saved");
      });
    }, SAVE_DEBOUNCE_MS);
  }

  function handleRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === board.name) {
      setName(board.name);
      return;
    }
    startTransition(async () => {
      const result = await renameWhiteboard(board.id, trimmed);
      if (!result.ok) {
        toast.error(result.error ?? "Error al renombrar");
        setName(board.name);
      }
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/pizarra" aria-label="Volver a Pizarra">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleRename}
          className="h-8 max-w-xs text-sm font-medium"
        />
        <span className="text-xs text-muted-foreground">
          {saveState === "saving" && "Guardando…"}
          {saveState === "saved" && "Guardado"}
          {saveState === "unsaved" && "Cambios sin guardar"}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleAddStickyNote}
          >
            <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
            Nota adhesiva
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label="Ayuda de la pizarra"
              >
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 text-sm">
              <p className="mb-2 font-medium text-foreground">Trucos rápidos</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {TIPS.map((tip) => (
                  <li key={tip}>• {tip}</li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="flex-1">
        <Excalidraw
          excalidrawAPI={(api) => {
            excalidrawApiRef.current = api;
          }}
          initialData={{
            elements: board.scene_data.elements as never,
            appState: board.scene_data.appState as never,
          }}
          onChange={handleSceneChange}
        />
      </div>
    </div>
  );
}
