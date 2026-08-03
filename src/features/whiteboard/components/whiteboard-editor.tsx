"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  renameWhiteboard,
  updateWhiteboardScene,
} from "@/features/whiteboard/services/whiteboard-actions";
import type { WhiteboardRow } from "@/features/whiteboard/types";
import "@excalidraw/excalidraw/index.css";

// Excalidraw touches the canvas/window APIs at import time — it can only
// ever run in the browser, never during SSR/static generation.
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
);

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

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

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
      </div>
      <div className="flex-1">
        <Excalidraw
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
