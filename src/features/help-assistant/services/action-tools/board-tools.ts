import { tool, zodSchema } from "ai";
import { z } from "zod";
import { getWhiteboard, updateWhiteboardSceneCas } from "@/features/whiteboard/services/whiteboard-actions";
import {
  buildStickyNote,
  buildConnectorArrow,
  createShapeElement,
  findFreePlacement,
  findBoundTextRef,
  centerOf,
  moveArrowEndpoint,
  summarizeBoardElements,
  boundingBoxOf,
  lastIndexOf,
  nextFractionalIndex,
  DELETION_GROUP_CUSTOM_DATA_KEY,
  AddNoteInputSchema,
  AddShapeInputSchema,
  NoteTextSchema,
  CoordinateSchema,
  type BoardElementUnknown,
} from "@/features/whiteboard/services/scene-adapter";
import { logAudit } from "@/features/audit/services/audit-log";
import { assertHelpActionAccess, assistantAccessErrorMessage } from "../assistant-access";
import { prepareConfirmableAction, type PendingConfirmationSlot } from "../pending-actions";
import type { HelpActionContext } from "../../types";

/**
 * Action tools for edición interna de Board — Fase 4C (con la revisión
 * correctiva de "nota como unidad semántica"). El modelo NUNCA recibe ni
 * devuelve el JSON completo de una escena, ni necesita conocer que una
 * nota adhesiva son en realidad dos elementos Excalidraw — cada tool
 * trabaja con IDs y resúmenes mínimos; toda lectura/escritura del
 * `scene_data` completo vive aquí, en scene-adapter.ts y
 * whiteboard-actions.ts — nunca cruza hacia generateText()/OpenRouter.
 *
 * Concurrencia por elemento (decisión cerrada): editar/mover/borrar exigen
 * expected_element_version. Si el MISMO elemento cambió entre la lectura y
 * la escritura, se rechaza con conflicto (nunca se pisa a ciegas). Si el
 * conflicto de versión de TABLERO fue por OTRO elemento, se relee la
 * escena fresca y se reintenta hasta 3 veces — seguro porque el parche que
 * se reaplica es el mismo, sobre datos frescos.
 */

const MAX_RETRIES = 3;

type PatchAttempt<T> = { elements: BoardElementUnknown[]; extra: T } | { error: string };

/**
 * Único punto de escritura de todas las tools de esta fase — lee la
 * escena fresca, aplica `attempt` (que decide si hay conflicto de
 * ELEMENTO, no solo de tablero), y reintenta el CAS hasta MAX_RETRIES
 * veces si el conflicto fue por otra parte de la escena. Escribe SOLO
 * `elements` — nunca appState (ver updateWhiteboardSceneCas).
 */
async function writeSceneWithRetry<T>(
  workspaceId: string,
  whiteboardId: string,
  attempt: (elements: BoardElementUnknown[]) => PatchAttempt<T>,
): Promise<{ ok: true; extra: T } | { ok: false; error: string }> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const board = await getWhiteboard(whiteboardId);
    if (!board || board.workspace_id !== workspaceId) {
      return { ok: false, error: "not_found_or_forbidden" };
    }

    const elements = (board.scene_data.elements ?? []) as BoardElementUnknown[];
    const result = attempt(elements);
    if ("error" in result) return { ok: false, error: result.error };

    const cas = await updateWhiteboardSceneCas(workspaceId, whiteboardId, board.version, result.elements);
    if (!cas.ok) return { ok: false, error: "internal_error" };

    if (cas.data.result === "updated") return { ok: true, extra: result.extra };
    if (cas.data.result === "not_found_or_forbidden") return { ok: false, error: "not_found_or_forbidden" };
    if (cas.data.result === "scene_too_large") return { ok: false, error: "scene_too_large" };
    // result === "conflict": otro escritor ganó — releer y reintentar.
  }
  return { ok: false, error: "conflict_exhausted" };
}

function findElement(elements: BoardElementUnknown[], id: string): BoardElementUnknown | undefined {
  return elements.find((e) => e.id === id && !e.isDeleted);
}

function bumpElement(el: BoardElementUnknown, patch: Record<string, unknown>): BoardElementUnknown {
  return {
    ...el,
    ...patch,
    version: Number(el.version ?? 0) + 1,
    versionNonce: Math.floor(Math.random() * 2_000_000_000),
    updated: Date.now(),
  };
}

const CONTAINER_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

const WhiteboardIdSchema = z.object({ whiteboard_id: z.string().uuid() });

const ListBoardElementsSchema = WhiteboardIdSchema.extend({
  include_deleted: z.boolean().optional().describe("Incluye elementos ya borrados (isDeleted) — por defecto no"),
});

const AddBoardNoteSchema = WhiteboardIdSchema.extend({ text: NoteTextSchema });

const AddBoardShapeSchema = WhiteboardIdSchema.merge(AddShapeInputSchema);

const UpdateElementTextSchema = WhiteboardIdSchema.extend({
  element_id: z.string().min(1).max(100).describe("El element_id de la nota/forma (o del texto) devuelto por list_board_elements o add_board_note — nunca hace falta saber si es el contenedor o su etiqueta interna"),
  expected_element_version: z.number().int().positive(),
  text: NoteTextSchema,
});

const MoveElementSchema = WhiteboardIdSchema.extend({
  element_id: z.string().min(1).max(100),
  expected_element_version: z.number().int().positive(),
  x: CoordinateSchema,
  y: CoordinateSchema,
});

const ConnectElementsSchema = WhiteboardIdSchema.extend({
  source_element_id: z.string().min(1).max(100),
  target_element_id: z.string().min(1).max(100),
});

const DeleteElementSchema = WhiteboardIdSchema.extend({
  element_id: z.string().min(1).max(100),
  expected_element_version: z.number().int().positive(),
});

const RestoreElementSchema = WhiteboardIdSchema.extend({
  element_id: z.string().min(1).max(100),
  expected_element_version: z.number().int().positive(),
});

const CONFLICT_MESSAGES: Record<string, string> = {
  element_not_found: "No encontré ese elemento en este tablero — puede que ya no exista. Vuelve a listar los elementos.",
  element_conflict: "Ese elemento cambió desde la última vez que lo leíste. Vuelve a listarlo antes de reintentar.",
  conflict_exhausted: "El tablero está cambiando muy rápido y no se pudo aplicar el cambio tras varios intentos. Inténtalo de nuevo.",
  not_found_or_forbidden: "No encontré ese tablero en esta empresa.",
  scene_too_large: "Este tablero llegó al límite de tamaño/elementos — no se puede añadir más contenido.",
  no_free_placement: "No encontré un hueco libre para colocar el elemento sin superponerlo con otro. Prueba a mover o borrar algo primero.",
  internal_error: "No se pudo guardar el cambio en este momento. Inténtalo de nuevo.",
  no_bound_text: "Esa nota no tiene ningún texto todavía — no hay nada que editar.",
  cannot_move_bound_text: "Ese elemento es el texto de una nota — no se puede mover por separado, se movería la etiqueta sin su contenedor. Mueve el contenedor.",
};

function toolError(code: string, extra?: Record<string, unknown>) {
  return { ok: false as const, error: CONFLICT_MESSAGES[code] ?? code, ...extra };
}

export function buildBoardTools(ctx: HelpActionContext, confirmationSlot: PendingConfirmationSlot) {
  return {
    list_board_elements: tool({
      description:
        "Lista los elementos de un tablero de Board como unidades comprensibles (una nota adhesiva es UNA fila: contenedor + su texto visible, nunca dos filas separadas) — NUNCA el JSON completo de Excalidraw. Necesitas su element_id y element_version antes de editar, mover, conectar o borrar cualquier elemento.",
      inputSchema: zodSchema(ListBoardElementsSchema),
      execute: async ({ whiteboard_id, include_deleted }: z.infer<typeof ListBoardElementsSchema>) => {
        const access = await assertHelpActionAccess(ctx, "whiteboard");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const board = await getWhiteboard(whiteboard_id);
        if (!board || board.workspace_id !== ctx.workspaceId) {
          return { ok: false, error: "No encontré ese tablero en esta empresa" };
        }

        const elements = (board.scene_data.elements ?? []) as BoardElementUnknown[];
        const visible = include_deleted ? elements : elements.filter((e) => !e.isDeleted);
        return { ok: true, elements: summarizeBoardElements(visible) };
      },
    }),

    add_board_note: tool({
      description:
        "Añade una nota adhesiva (rectángulo con texto) a un tablero de Board, colocada automáticamente sin superponerse con nada existente. Ejecución directa — creación reversible, no requiere confirmación. Devuelve el element_id del CONTENEDOR — úsalo tal cual en el resto de tools, nunca hace falta el id de su texto interno.",
      inputSchema: zodSchema(AddBoardNoteSchema),
      execute: async ({ whiteboard_id, text }: z.infer<typeof AddBoardNoteSchema>) => {
        const access = await assertHelpActionAccess(ctx, "whiteboard");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await writeSceneWithRetry<{ elementId: string }>(ctx.workspaceId, whiteboard_id, (elements) => {
          const boxes = elements.filter((e) => !e.isDeleted).map(boundingBoxOf);
          const placement = findFreePlacement(boxes, { width: 220, height: 160 });
          if (!placement) return { error: "no_free_placement" };

          const { container, label } = buildStickyNote({
            text,
            x: placement.x,
            y: placement.y,
            lastIndex: lastIndexOf(elements),
          });
          return { elements: [...elements, container, label] as BoardElementUnknown[], extra: { elementId: container.id } };
        });

        if (!result.ok) return toolError(result.error);

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.add_board_note",
          targetType: "whiteboard",
          targetId: whiteboard_id,
          summary: "Asistente de Ayuda añadió una nota adhesiva a un tablero",
          metadata: { element_id: result.extra.elementId },
        });

        return { ok: true, element_id: result.extra.elementId };
      },
    }),

    add_board_shape: tool({
      description:
        "Añade una forma (rectangle, ellipse o diamond) a un tablero de Board, colocada automáticamente sin superponerse. Con texto opcional dentro. Ejecución directa.",
      inputSchema: zodSchema(AddBoardShapeSchema),
      execute: async ({ whiteboard_id, shape, text }: z.infer<typeof AddBoardShapeSchema>) => {
        const access = await assertHelpActionAccess(ctx, "whiteboard");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await writeSceneWithRetry<{ elementId: string }>(ctx.workspaceId, whiteboard_id, (elements) => {
          const width = 180;
          const height = 120;
          const boxes = elements.filter((e) => !e.isDeleted).map(boundingBoxOf);
          const placement = findFreePlacement(boxes, { width, height });
          if (!placement) return { error: "no_free_placement" };

          if (text) {
            const { container, label } = buildStickyNote({ text, x: placement.x, y: placement.y, width, height, lastIndex: lastIndexOf(elements) });
            const shaped = { ...container, type: shape };
            return { elements: [...elements, shaped, label] as BoardElementUnknown[], extra: { elementId: shaped.id } };
          }

          const index = nextFractionalIndex(lastIndexOf(elements));
          const el = createShapeElement({ type: shape, x: placement.x, y: placement.y, width, height, index });
          return { elements: [...elements, el] as BoardElementUnknown[], extra: { elementId: el.id } };
        });

        if (!result.ok) return toolError(result.error);

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.add_board_shape",
          targetType: "whiteboard",
          targetId: whiteboard_id,
          summary: `Asistente de Ayuda añadió una forma (${shape}) a un tablero`,
          metadata: { element_id: result.extra.elementId, shape },
        });

        return { ok: true, element_id: result.extra.elementId };
      },
    }),

    update_board_element_text: tool({
      description:
        "Cambia el texto VISIBLE de una nota/forma de un tablero de Board. Acepta el element_id de la nota (contenedor) O de su texto directamente — si le das el contenedor, localiza y edita su texto ligado automáticamente, nunca añade texto a una forma que no lo soporta. Necesitas element_version — obtenlo con list_board_elements justo antes.",
      inputSchema: zodSchema(UpdateElementTextSchema),
      execute: async ({ whiteboard_id, element_id, expected_element_version, text }: z.infer<typeof UpdateElementTextSchema>) => {
        const access = await assertHelpActionAccess(ctx, "whiteboard");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await writeSceneWithRetry<{ elementId: string; newVersion: number }>(ctx.workspaceId, whiteboard_id, (elements) => {
          const target = findElement(elements, element_id);
          if (!target) return { error: "element_not_found" };
          if (Number(target.version) !== expected_element_version) return { error: "element_conflict" };

          // Texto directo: se edita él mismo.
          if (target.type === "text") {
            const patched = bumpElement(target, { text, originalText: text });
            return {
              elements: elements.map((e) => (e.id === element_id ? patched : e)),
              extra: { elementId: element_id, newVersion: Number(patched.version) },
            };
          }

          // Contenedor: NUNCA se le añade una propiedad `text` propia —
          // localiza su texto ligado y edita ESE elemento. El contenedor
          // también sube de versión (aunque su x/y/color no cambien) para
          // que element_version siga siendo un token de concurrencia
          // fiable de "la nota entera cambió", coherente con lo que
          // list_board_elements expone como versión de la nota.
          if (CONTAINER_TYPES.has(String(target.type))) {
            const boundTextRef = findBoundTextRef(target);
            if (!boundTextRef) return { error: "no_bound_text" };
            const textEl = elements.find((e) => e.id === boundTextRef.id && !e.isDeleted);
            if (!textEl) return { error: "element_not_found" };

            const patchedText = bumpElement(textEl, { text, originalText: text });
            const patchedContainer = bumpElement(target, {});
            return {
              elements: elements.map((e) => {
                if (e.id === element_id) return patchedContainer;
                if (e.id === boundTextRef.id) return patchedText;
                return e;
              }),
              extra: { elementId: boundTextRef.id, newVersion: Number(patchedContainer.version) },
            };
          }

          return { error: "unsupported_element_type" };
        });

        if (!result.ok) return toolError(result.error);

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_board_element_text",
          targetType: "whiteboard",
          targetId: whiteboard_id,
          summary: "Asistente de Ayuda cambió el texto de una nota de Board",
          metadata: { element_id, text_element_id: result.extra.elementId },
        });

        return { ok: true, element_id, element_version: result.extra.newVersion };
      },
    }),

    move_board_element: tool({
      description:
        "Mueve una nota/forma/flecha existente de un tablero de Board a una nueva posición. Si es un contenedor con texto ligado, mueve también su texto y actualiza las flechas conectadas para que sigan apuntando bien. No puedes mover el texto de una nota por separado — mueve la nota (su element_id de contenedor) en su lugar. Necesitas element_version — obtenlo con list_board_elements justo antes.",
      inputSchema: zodSchema(MoveElementSchema),
      execute: async ({ whiteboard_id, element_id, expected_element_version, x, y }: z.infer<typeof MoveElementSchema>) => {
        const access = await assertHelpActionAccess(ctx, "whiteboard");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await writeSceneWithRetry<{ newVersion: number }>(ctx.workspaceId, whiteboard_id, (elements) => {
          const target = findElement(elements, element_id);
          if (!target) return { error: "element_not_found" };
          if (Number(target.version) !== expected_element_version) return { error: "element_conflict" };

          // Un texto ligado a un contenedor nunca se mueve solo — se
          // desincronizaría visualmente de su nota. Instrucción clara en
          // vez de moverlo en silencio o redirigir sin avisar.
          if (target.type === "text" && typeof target.containerId === "string") {
            return { error: "cannot_move_bound_text" };
          }

          const deltaX = x - Number(target.x ?? 0);
          const deltaY = y - Number(target.y ?? 0);
          const movedIds = new Set<string>([element_id]);
          const patchedById = new Map<string, BoardElementUnknown>();
          patchedById.set(element_id, bumpElement(target, { x, y }));

          if (CONTAINER_TYPES.has(String(target.type))) {
            // Texto ligado: se desplaza EXACTAMENTE el mismo delta.
            const boundTextRef = findBoundTextRef(target);
            if (boundTextRef) {
              const textEl = elements.find((e) => e.id === boundTextRef.id && !e.isDeleted);
              if (textEl) {
                patchedById.set(textEl.id, bumpElement(textEl, { x: Number(textEl.x ?? 0) + deltaX, y: Number(textEl.y ?? 0) + deltaY }));
                movedIds.add(textEl.id);
              }
            }
          }

          // Flechas conectadas al elemento movido: se recalcula SOLO el
          // extremo unido a él, conservando el otro extremo exactamente
          // donde estaba — conserva bindings, nunca los toca.
          const movedNewCenter = centerOf(patchedById.get(element_id)!);
          for (const el of elements) {
            if (el.type !== "arrow" || el.isDeleted) continue;
            const startBinding = el.startBinding as { elementId?: string } | null;
            const endBinding = el.endBinding as { elementId?: string } | null;
            const startsHere = startBinding?.elementId === element_id;
            const endsHere = endBinding?.elementId === element_id;
            if (!startsHere && !endsHere) continue;

            let patchedArrow = el;
            if (startsHere) patchedArrow = moveArrowEndpoint(patchedArrow, "start", movedNewCenter);
            if (endsHere) patchedArrow = moveArrowEndpoint(patchedArrow, "end", movedNewCenter);
            patchedById.set(el.id, bumpElement(patchedArrow, {}));
          }

          const nextElements = elements.map((e) => patchedById.get(e.id) ?? e);
          return { elements: nextElements, extra: { newVersion: Number(patchedById.get(element_id)!.version) } };
        });

        if (!result.ok) return toolError(result.error);

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.move_board_element",
          targetType: "whiteboard",
          targetId: whiteboard_id,
          summary: "Asistente de Ayuda movió una nota/forma de Board",
          metadata: { element_id },
        });

        return { ok: true, element_id, element_version: result.extra.newVersion };
      },
    }),

    connect_board_elements: tool({
      description:
        "Conecta dos elementos existentes de un tablero de Board con una flecha. Relee ambos extremos en el momento de conectar (posiciones y enlaces frescos) — solo necesitas sus element_id, no su versión.",
      inputSchema: zodSchema(ConnectElementsSchema),
      execute: async ({ whiteboard_id, source_element_id, target_element_id }: z.infer<typeof ConnectElementsSchema>) => {
        const access = await assertHelpActionAccess(ctx, "whiteboard");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        if (source_element_id === target_element_id) {
          return { ok: false, error: "No puedes conectar un elemento consigo mismo" };
        }

        const result = await writeSceneWithRetry<{ arrowId: string }>(ctx.workspaceId, whiteboard_id, (elements) => {
          const source = findElement(elements, source_element_id);
          const target = findElement(elements, target_element_id);
          if (!source || !target) return { error: "element_not_found" };

          const { arrow, patchedSource, patchedTarget } = buildConnectorArrow({ source, target, lastIndex: lastIndexOf(elements) });
          const next = elements.map((e) => {
            if (e.id === source_element_id) return { ...patchedSource, version: Number(source.version) + 1, versionNonce: Math.floor(Math.random() * 2_000_000_000), updated: Date.now() };
            if (e.id === target_element_id) return { ...patchedTarget, version: Number(target.version) + 1, versionNonce: Math.floor(Math.random() * 2_000_000_000), updated: Date.now() };
            return e;
          });
          return { elements: [...next, arrow] as BoardElementUnknown[], extra: { arrowId: arrow.id } };
        });

        if (!result.ok) return toolError(result.error);

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.connect_board_elements",
          targetType: "whiteboard",
          targetId: whiteboard_id,
          summary: "Asistente de Ayuda conectó dos elementos de Board con una flecha",
          metadata: { source_element_id, target_element_id, arrow_id: result.extra.arrowId },
        });

        return { ok: true, arrow_id: result.extra.arrowId };
      },
    }),

    delete_board_element: tool({
      description:
        "Elimina una nota/forma/flecha de un tablero de Board de forma REALMENTE reversible (nunca se borra de verdad — restore_board_element la recupera entera, con su texto y sus flechas). Requiere confirmación explícita del usuario: esta herramienta solo PREPARA el borrado, nunca lo ejecuta directamente. Necesitas element_id y element_version — obtenlos con list_board_elements justo antes. Como máximo una acción pendiente de confirmación por respuesta.",
      inputSchema: zodSchema(DeleteElementSchema),
      execute: async ({ whiteboard_id, element_id, expected_element_version }: z.infer<typeof DeleteElementSchema>) => {
        const access = await assertHelpActionAccess(ctx, "whiteboard");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        if (confirmationSlot.remaining <= 0) {
          return {
            ok: false,
            error: "Ya hay otra acción esperando confirmación en esta respuesta. Resuélvela (confirma o cancela) antes de pedir otra.",
          };
        }

        const board = await getWhiteboard(whiteboard_id);
        if (!board || board.workspace_id !== ctx.workspaceId) {
          return { ok: false, error: "No encontré ese tablero en esta empresa" };
        }
        const elements = (board.scene_data.elements ?? []) as BoardElementUnknown[];
        const target = findElement(elements, element_id);
        if (!target) return { ok: false, error: "No encontré ese elemento en este tablero" };
        if (Number(target.version) !== expected_element_version) {
          return { ok: false, error: "Ese elemento cambió desde la última vez que lo leíste. Vuelve a listarlo antes de reintentar." };
        }

        // Resumen desde la fila real — si el objetivo es un contenedor,
        // describe su texto ligado (lo que el usuario reconoce como "la
        // nota"), nunca el rectángulo en abstracto.
        let visibleText: string | undefined;
        if (target.type === "text" && typeof target.text === "string") visibleText = target.text;
        else if (CONTAINER_TYPES.has(String(target.type))) {
          const boundTextRef = findBoundTextRef(target);
          const boundText = boundTextRef ? elements.find((e) => e.id === boundTextRef.id) : undefined;
          if (boundText && typeof boundText.text === "string") visibleText = boundText.text;
        }
        const description = visibleText ? `«${visibleText.length > 60 ? `${visibleText.slice(0, 60)}…` : visibleText}»` : `de tipo ${target.type}`;
        const summary = `Vas a eliminar ${description} del tablero «${board.name}». Podrás restaurarlo entero después.`;

        const prepared = await prepareConfirmableAction({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          actionType: "delete_board_element",
          payload: { whiteboard_id, element_id, expected_element_version },
          summary,
        });
        if (!prepared) return { ok: false, error: "No se pudo preparar el borrado. Inténtalo de nuevo." };

        confirmationSlot.remaining -= 1;
        confirmationSlot.prepared = { token: prepared.token, expiresInSeconds: prepared.expiresInSeconds, summary };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.action_prepared",
          targetType: "assistant_pending_action",
          targetId: prepared.pendingActionId,
          summary: `Asistente de Ayuda preparó el borrado de un elemento de Board, pendiente de confirmación`,
          metadata: { action_type: "delete_board_element", whiteboard_id, element_id },
        });

        return { ok: true, requiresConfirmation: true, summary, expiresInSeconds: prepared.expiresInSeconds };
      },
    }),

    restore_board_element: tool({
      description:
        "Restaura un elemento de Board previamente eliminado — y con él, TODO lo que se eliminó en la misma operación (su texto ligado si era una nota, las flechas que se retiraron con él), con sus conexiones intactas. Reversible, se ejecuta directamente sin pedir confirmación. Necesitas element_id y element_version (list_board_elements con include_deleted:true).",
      inputSchema: zodSchema(RestoreElementSchema),
      execute: async ({ whiteboard_id, element_id, expected_element_version }: z.infer<typeof RestoreElementSchema>) => {
        const access = await assertHelpActionAccess(ctx, "whiteboard");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await writeSceneWithRetry<{ newVersion: number; restoredIds: string[] }>(ctx.workspaceId, whiteboard_id, (elements) => {
          const el = elements.find((e) => e.id === element_id);
          if (!el) return { error: "element_not_found" };
          if (!el.isDeleted) return { error: "element_not_deleted" };
          if (Number(el.version) !== expected_element_version) return { error: "element_conflict" };

          const customData = (el.customData as Record<string, unknown> | undefined) ?? {};
          const groupId = customData[DELETION_GROUP_CUSTOM_DATA_KEY];

          const restoredIds: string[] = [];
          const nextElements = elements.map((e) => {
            const eCustomData = (e.customData as Record<string, unknown> | undefined) ?? {};
            const sameGroup = groupId != null && eCustomData[DELETION_GROUP_CUSTOM_DATA_KEY] === groupId;
            const inGroup = e.id === element_id || sameGroup;
            if (!inGroup || !e.isDeleted) return e;

            restoredIds.push(e.id);
            // Limpia SOLO la clave de restauración — conserva cualquier
            // otra clave de customData que ya existiera.
            const { [DELETION_GROUP_CUSTOM_DATA_KEY]: _removed, ...restCustomData } = eCustomData;
            const hasRest = Object.keys(restCustomData).length > 0;
            return bumpElement(e, { isDeleted: false, customData: hasRest ? restCustomData : undefined });
          });

          return { elements: nextElements, extra: { newVersion: Number(nextElements.find((e) => e.id === element_id)!.version), restoredIds } };
        });

        if (!result.ok) {
          if (result.error === "element_not_deleted") return { ok: false, error: "Ese elemento no está eliminado" };
          return toolError(result.error);
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.restore_board_element",
          targetType: "whiteboard",
          targetId: whiteboard_id,
          summary: "Asistente de Ayuda restauró un elemento eliminado de Board (y su grupo completo)",
          metadata: { element_id, restored_ids: result.extra.restoredIds },
        });

        return { ok: true, element_id, element_version: result.extra.newVersion };
      },
    }),
  };
}
