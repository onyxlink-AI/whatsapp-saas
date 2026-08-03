"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, PenTool, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import {
  createWhiteboard,
  deleteWhiteboard,
} from "@/features/whiteboard/services/whiteboard-actions";
import type { WhiteboardRow } from "@/features/whiteboard/types";

interface Props {
  workspaceId: string;
  initialBoards: WhiteboardRow[];
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function WhiteboardList({ workspaceId, initialBoards }: Props) {
  const [boards, setBoards] = useState(initialBoards);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate() {
    startTransition(async () => {
      const result = await createWhiteboard(workspaceId);
      if (!result.ok) {
        toast.error(result.error ?? "Error al crear el tablero");
        return;
      }
      router.push(`/pizarra/${result.data.id}`);
    });
  }

  function handleDelete(board: WhiteboardRow) {
    const ok = window.confirm(`¿Eliminar el tablero "${board.name}"? No se puede deshacer.`);
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteWhiteboard(board.id);
      if (!result.ok) {
        toast.error(result.error ?? "Error al eliminar el tablero");
        return;
      }
      setBoards((prev) => prev.filter((b) => b.id !== board.id));
      toast.success("Tablero eliminado");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={handleCreate} disabled={isPending} className="gap-1.5">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Nuevo tablero
        </Button>
      </div>

      {boards.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <PenTool className="h-8 w-8" aria-hidden="true" />
          <p className="text-sm">Todavía no tienes tableros. Crea el primero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <Card key={board.id} className="cursor-pointer transition hover:border-primary/40">
              <div onClick={() => router.push(`/pizarra/${board.id}`)}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PenTool className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{board.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Actualizado el {formatDate(board.updated_at)}
                  </p>
                </CardContent>
              </div>
              <CardFooter className="justify-end pt-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  aria-label={`Eliminar ${board.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(board);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
