"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Copy, HelpCircle, StickyNote, Waypoints } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  duplicateWhiteboard,
  renameWhiteboard,
  updateWhiteboardScene,
} from "@/features/whiteboard/services/whiteboard-actions";
import type { WhiteboardRow } from "@/features/whiteboard/types";
import type * as ExcalidrawModuleType from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

// Excalidraw touches the canvas/window APIs at import time — it can only
// ever run in the browser, never during SSR/static generation. Loaded via
// useEffect (client-only) instead of next/dynamic() because MainMenu's
// compound sub-components (MainMenu.DefaultItems.*) are static properties
// that next/dynamic()'s wrapper doesn't forward.
type LoadedExcalidraw = {
  Excalidraw: typeof ExcalidrawModuleType.Excalidraw;
  MainMenu: typeof ExcalidrawModuleType.MainMenu;
};

const TIPS = [
  "Doble clic dentro de una nota o forma para escribir — el texto se centra solo.",
  "Selecciona una forma para cambiar su color, relleno y grosor del borde en el panel de la izquierda.",
  "Acerca una flecha al borde de una forma: se queda pegada sola, y la sigue si la mueves.",
  "Arrastra una forma cerca de otra y aparecen guías rosas para alinearlas solas.",
  "Usa \"+ Nota adhesiva\" para añadir un post-it listo para escribir en un clic.",
  "Selecciona una nota y usa \"+ Nota conectada\" para crear otra ya unida con una flecha.",
  "Con 2 o más formas seleccionadas, el panel izquierdo muestra alinear y distribuir.",
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
  const router = useRouter();
  const [name, setName] = useState(board.name);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [mod, setMod] = useState<LoadedExcalidraw | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@excalidraw/excalidraw").then((loaded) => {
      if (!cancelled) setMod({ Excalidraw: loaded.Excalidraw, MainMenu: loaded.MainMenu });
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Selecciona una nota/forma y crea otra ya conectada con una flecha —
  // arrow binding nativo de Excalidraw (start/end por id), no un motor
  // paralelo. Reinserta la forma de origen en la misma conversión
  // (regenerateIds:false) solo para que el id quede disponible como
  // extremo de la flecha; su contenido no cambia.
  async function handleAddConnectedNote() {
    const api = excalidrawApiRef.current;
    if (!api) return;

    const appState = api.getAppState();
    const selectedIds = Object.entries(appState.selectedElementIds)
      .filter(([, selected]) => selected)
      .map(([id]) => id);

    if (selectedIds.length !== 1) {
      toast.error("Selecciona primero una nota o forma para conectar");
      return;
    }

    const sceneElements = api.getSceneElements();
    const source = sceneElements.find((el) => el.id === selectedIds[0]);
    if (!source) return;

    const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
    const width = 220;
    const height = 160;
    const gap = 80;
    const x = source.x + source.width + gap;
    const y = source.y;
    const newNoteId = `note-${Date.now()}`;

    const created = convertToExcalidrawElements(
      [
        source as never,
        {
          id: newNoteId,
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
        {
          type: "arrow",
          x: source.x + source.width,
          y: source.y + source.height / 2,
          start: { type: source.type as never, id: source.id },
          end: { type: "rectangle", id: newNoteId },
        },
      ],
      { regenerateIds: false },
    );

    const convertedSource = created.find((el) => el.id === source.id);
    const newRect = created.find((el) => el.id === newNoteId);
    const newLabel = created.find((el) => el.type === "text" && "containerId" in el && el.containerId === newNoteId);
    const newArrow = created.find((el) => el.type === "arrow");
    if (!newRect || !newArrow) return;

    const remaining = sceneElements.filter((el) => el.id !== source.id);
    api.updateScene({
      elements: [...remaining, convertedSource ?? source, newRect, ...(newLabel ? [newLabel] : []), newArrow],
      appState: {
        selectedElementIds: { [newRect.id]: true },
        editingTextElement: newLabel ?? null,
      },
    });
  }

  function handleDuplicateBoard() {
    setDuplicating(true);
    startTransition(async () => {
      const result = await duplicateWhiteboard(board.id);
      setDuplicating(false);
      if (!result.ok) {
        toast.error(result.error ?? "Error al duplicar el tablero");
        return;
      }
      toast.success("Tablero duplicado");
      router.push(`/pizarra/${result.data.id}`);
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
          <Link href="/proyectos?view=board" aria-label="Volver a Board">
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
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleAddConnectedNote}
          >
            <Waypoints className="h-3.5 w-3.5" aria-hidden="true" />
            Nota conectada
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={handleDuplicateBoard}
            disabled={duplicating}
            aria-label="Duplicar tablero"
            title="Duplicar tablero"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label="Ayuda del Board"
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
        {mod && (
          <mod.Excalidraw
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
            }}
            initialData={{
              elements: board.scene_data.elements as never,
              appState: board.scene_data.appState as never,
            }}
            onChange={handleSceneChange}
          >
            {/* Fase 2: sin Discord/X/GitHub ni el disparador de colaboración en
                vivo (no hay esa función) ni cargar/guardar archivo local (todo
                se autoguarda en Supabase) — solo lo que aplica a OnyxLink. */}
            <mod.MainMenu>
              <mod.MainMenu.DefaultItems.SaveAsImage />
              <mod.MainMenu.DefaultItems.Export />
              <mod.MainMenu.DefaultItems.ChangeCanvasBackground />
              <mod.MainMenu.Separator />
              <mod.MainMenu.DefaultItems.ClearCanvas />
              <mod.MainMenu.Separator />
              <mod.MainMenu.DefaultItems.Help />
            </mod.MainMenu>
          </mod.Excalidraw>
        )}
      </div>
    </div>
  );
}
