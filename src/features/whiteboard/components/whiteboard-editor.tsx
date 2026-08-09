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
  updateWhiteboardSceneCas,
  updateWhiteboardAppState,
  getWhiteboard,
} from "@/features/whiteboard/services/whiteboard-actions";
import { elementVersionsById, mergeDisjointChanges, onlyAppStateChanged, type ElementVersionMap } from "@/features/whiteboard/services/scene-merge";
import { PERSISTABLE_APP_STATE_KEYS, type BoardElementUnknown } from "@/features/whiteboard/services/scene-adapter";
import type { WhiteboardRow } from "@/features/whiteboard/types";
import { WhiteboardConflictBanner } from "./whiteboard-conflict-banner";
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
  "El Asistente de Ayuda también puede añadir notas, formas y conexiones a este tablero si se lo pides.",
];

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
const MERGE_RETRY_ATTEMPTS = 3;

interface Props {
  board: WhiteboardRow;
}

interface ConflictState {
  conflictingIds: string[];
  remoteBoard: WhiteboardRow;
}

export function WhiteboardEditor({ board: initialBoard }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialBoard.name);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [mod, setMod] = useState<LoadedExcalidraw | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [, startTransition] = useTransition();
  const elementsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // Fase 4C: "board" vive en un ref además de en estado — el debounce del
  // autoguardado necesita SIEMPRE la versión más reciente conocida, nunca
  // una capturada por el closure del render en el que se disparó el timer.
  const boardRef = useRef<WhiteboardRow>(initialBoard);
  // Última base sincronizada (id -> version de cada elemento) — el punto
  // de comparación para saber qué cambió "en local" y qué cambió "en
  // remoto" desde la última vez que ambos lados coincidieron.
  const baseVersionsRef = useRef<ElementVersionMap>(elementVersionsById(initialBoard.scene_data.elements as BoardElementUnknown[]));
  // true mientras hay un conflicto del MISMO elemento sin resolver — el
  // autoguardado de ELEMENTOS se pausa por completo (nunca sigue
  // escribiendo por su cuenta ni recarga destruyendo cambios locales). El
  // guardado de appState (revisión correctiva, §4) es independiente y
  // sigue funcionando aunque esto esté en pausa — el viewport no es
  // contenido en conflicto con nada.
  const pausedRef = useRef(false);

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
      if (elementsTimeoutRef.current) clearTimeout(elementsTimeoutRef.current);
      if (appStateTimeoutRef.current) clearTimeout(appStateTimeoutRef.current);
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
      const result = await duplicateWhiteboard(boardRef.current.id);
      setDuplicating(false);
      if (!result.ok) {
        toast.error(result.error ?? "Error al duplicar el tablero");
        return;
      }
      toast.success("Tablero duplicado");
      router.push(`/pizarra/${result.data.id}`);
    });
  }

  /**
   * Fase 4C — única función que escribe scene_data.elements. Nunca pisa a
   * ciegas:
   * - Si el CAS choca (`conflict`), relee el tablero fresco y decide:
   *   cambios disjuntos → fusiona y reintenta (hasta MERGE_RETRY_ATTEMPTS);
   *   mismo elemento en ambos lados → pausa el autoguardado y muestra el
   *   banner, nunca recarga ni pisa por su cuenta.
   * Nunca toca appState — updateWhiteboardSceneCas() solo escribe
   * `elements` (ver revisión correctiva §4), así que esta función no
   * puede pisar un zoom/scroll más fresco que el que otra pestaña o el
   * propio guardado de appState (más abajo) acaba de persistir.
   */
  async function attemptSaveElements(localElements: BoardElementUnknown[]) {
    if (pausedRef.current) return;

    setSaveState("saving");
    let elementsToWrite = localElements;
    let expectedVersion = boardRef.current.version;

    for (let attempt = 0; attempt < MERGE_RETRY_ATTEMPTS; attempt++) {
      const cas = await updateWhiteboardSceneCas(boardRef.current.workspace_id, boardRef.current.id, expectedVersion, elementsToWrite);

      if (!cas.ok) {
        setSaveState("unsaved");
        toast.error(cas.error ?? "Error al guardar el tablero");
        return;
      }

      if (cas.data.result === "updated") {
        baseVersionsRef.current = elementVersionsById(elementsToWrite);
        boardRef.current = { ...boardRef.current, version: cas.data.version, scene_data: { ...boardRef.current.scene_data, elements: elementsToWrite } };
        setSaveState("saved");
        return;
      }

      if (cas.data.result === "not_found_or_forbidden") {
        setSaveState("unsaved");
        toast.error("Ya no tienes acceso a este tablero");
        return;
      }

      if (cas.data.result === "scene_too_large") {
        setSaveState("unsaved");
        toast.error("Este tablero llegó al límite de tamaño o número de elementos");
        return;
      }

      // result === "conflict": otro escritor (probablemente el Asistente
      // de Ayuda) ganó desde que se cargó esta página. Releer y decidir.
      const remote = await getWhiteboard(boardRef.current.id);
      if (!remote) {
        setSaveState("unsaved");
        toast.error("Ya no tienes acceso a este tablero");
        return;
      }

      const merge = mergeDisjointChanges({
        baseVersions: baseVersionsRef.current,
        localElements,
        remoteElements: remote.scene_data.elements as BoardElementUnknown[],
      });

      if (merge.kind === "same_element_conflict") {
        // NUNCA recargar ni pisar por su cuenta — pausa y deja que decida el usuario.
        pausedRef.current = true;
        setConflict({ conflictingIds: merge.conflictingIds, remoteBoard: remote });
        setSaveState("unsaved");
        return;
      }

      // Cambios disjuntos: reintenta el CAS con la versión remota fresca.
      elementsToWrite = merge.elements;
      expectedVersion = remote.version;
    }

    // Se agotaron los reintentos — el tablero cambia muy rápido. Deja el
    // estado como "sin guardar" (nunca se pierde nada: el próximo tick del
    // debounce, o el propio usuario editando de nuevo, volverá a intentarlo).
    setSaveState("unsaved");
    toast.error("El tablero está cambiando muy rápido — tus cambios se reintentarán en el próximo guardado.");
  }

  /**
   * Fase 4C revisión correctiva (§4) — guarda SOLO scene_data.appState.
   * Independiente del guardado de elementos: nunca se bloquea por una
   * pausa de conflicto de elementos, nunca compite por `version`, nunca
   * envía una copia de `elements` (evita pisar ediciones ajenas con una
   * copia vieja). Best-effort silencioso salvo pérdida real de acceso.
   */
  async function attemptSaveAppState(appState: Record<string, unknown>) {
    const result = await updateWhiteboardAppState(boardRef.current.workspace_id, boardRef.current.id, appState);
    if (!result.ok) {
      console.error("[WhiteboardEditor] error guardando la vista del tablero:", result.error);
      return;
    }
    if (result.data.result === "not_found_or_forbidden") {
      toast.error("Ya no tienes acceso a este tablero");
      return;
    }
    boardRef.current = { ...boardRef.current, scene_data: { ...boardRef.current.scene_data, appState } };
  }

  function handleSceneChange(elements: readonly unknown[], appState: unknown) {
    const snapshot = [...elements] as BoardElementUnknown[];
    const appStateSnapshot = pickPersistableAppState(appState as Record<string, unknown>);

    // El guardado de appState es SIEMPRE independiente — nunca lo bloquea
    // una pausa por conflicto de elementos, nunca gasta version.
    if (appStateTimeoutRef.current) clearTimeout(appStateTimeoutRef.current);
    appStateTimeoutRef.current = setTimeout(() => {
      startTransition(() => void attemptSaveAppState(appStateSnapshot));
    }, SAVE_DEBOUNCE_MS);

    if (pausedRef.current) return;
    // Ningún elemento cambió de versión -> el único cambio posible fue de
    // cámara/color activo, ya cubierto arriba. No hay nada de contenido
    // que guardar ni ningún motivo para tocar `elements`/`version`.
    if (onlyAppStateChanged(baseVersionsRef.current, snapshot)) return;

    setSaveState("unsaved");
    if (elementsTimeoutRef.current) clearTimeout(elementsTimeoutRef.current);
    elementsTimeoutRef.current = setTimeout(() => {
      startTransition(() => void attemptSaveElements(snapshot));
    }, SAVE_DEBOUNCE_MS);
  }

  function handleReloadRemote() {
    if (!conflict) return;
    const api = excalidrawApiRef.current;
    const remoteElements = conflict.remoteBoard.scene_data.elements as BoardElementUnknown[];
    api?.updateScene({ elements: remoteElements as never, appState: conflict.remoteBoard.scene_data.appState as never });
    baseVersionsRef.current = elementVersionsById(remoteElements);
    boardRef.current = conflict.remoteBoard;
    setConflict(null);
    pausedRef.current = false;
    setSaveState("saved");
    toast.success("Se recargaron los cambios más recientes del tablero");
  }

  function handleKeepMyChanges() {
    if (!conflict) return;
    const api = excalidrawApiRef.current;
    if (!api) return;

    setResolvingConflict(true);
    startTransition(async () => {
      const localElements = [...api.getSceneElements()] as unknown as BoardElementUnknown[];
      const merge = mergeDisjointChanges({
        baseVersions: baseVersionsRef.current,
        localElements,
        remoteElements: conflict.remoteBoard.scene_data.elements as BoardElementUnknown[],
        preferLocalForIds: new Set(conflict.conflictingIds),
      });

      if (merge.kind !== "merged") {
        // No debería ocurrir — preferLocalForIds cubre exactamente los ids
        // conflictivos — pero si de algún modo persiste, no se arriesga
        // nada: se deja el banner tal cual para que el usuario reintente.
        setResolvingConflict(false);
        return;
      }

      const cas = await updateWhiteboardSceneCas(boardRef.current.workspace_id, boardRef.current.id, conflict.remoteBoard.version, merge.elements);

      setResolvingConflict(false);

      if (!cas.ok || cas.data.result !== "updated") {
        toast.error("El tablero volvió a cambiar — inténtalo de nuevo");
        return;
      }

      baseVersionsRef.current = elementVersionsById(merge.elements);
      boardRef.current = { ...boardRef.current, version: cas.data.version };
      api.updateScene({ elements: merge.elements as never });
      setConflict(null);
      pausedRef.current = false;
      setSaveState("saved");
      toast.success("Tus cambios se guardaron, conservando los tuyos en los elementos en conflicto");
    });
  }

  function handleRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === boardRef.current.name) {
      setName(boardRef.current.name);
      return;
    }
    startTransition(async () => {
      const result = await renameWhiteboard(boardRef.current.workspace_id, boardRef.current.id, trimmed);
      if (!result.ok) {
        toast.error(result.error ?? "Error al renombrar");
        setName(boardRef.current.name);
      } else {
        boardRef.current = { ...boardRef.current, name: trimmed };
      }
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link href="/proyectos?view=board" aria-label="Volver a Board">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleRename}
          className="h-8 min-w-0 max-w-xs flex-1 text-sm font-medium"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {saveState === "saving" && "Guardando…"}
          {saveState === "saved" && "Guardado"}
          {saveState === "unsaved" && "Cambios sin guardar"}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
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

      {conflict && (
        <WhiteboardConflictBanner
          conflictingCount={conflict.conflictingIds.length}
          onReloadRemote={handleReloadRemote}
          onKeepMyChanges={handleKeepMyChanges}
          resolving={resolvingConflict}
        />
      )}

      <div className="flex-1">
        {mod && (
          <mod.Excalidraw
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
            }}
            initialData={{
              elements: initialBoard.scene_data.elements as never,
              appState: initialBoard.scene_data.appState as never,
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
