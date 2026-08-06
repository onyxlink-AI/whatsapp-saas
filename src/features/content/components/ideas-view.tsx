"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Lightbulb, Plus, Search, ArrowRight } from "lucide-react";
import { createContentItem, moveContentStatus } from "@/features/content/services/content-actions";
import type { ContentItemRow } from "@/features/content/types";

interface IdeasViewProps {
  workspaceId: string;
  items: ContentItemRow[];
}

export function IdeasView({ workspaceId, items }: IdeasViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIdea, setNewIdea] = useState("");
  const [, startTransition] = useTransition();

  const ideas = useMemo(() => {
    const list = items.filter((i) => i.status === "idea");
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (i) => i.title.toLowerCase().includes(q) || (i.main_idea ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  function handleCreate() {
    if (!newTitle.trim()) {
      toast.error("El título es requerido");
      return;
    }
    startTransition(async () => {
      const result = await createContentItem(workspaceId, {
        title: newTitle.trim(),
        main_idea: newIdea.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Error al crear la idea");
        return;
      }
      toast.success("Idea creada");
      setCreateOpen(false);
      setNewTitle("");
      setNewIdea("");
      router.refresh();
    });
  }

  function handleConvert(id: string) {
    startTransition(async () => {
      const result = await moveContentStatus(workspaceId, id, "in_production", 0);
      if (!result.ok) {
        toast.error(result.error ?? "Error al convertir");
        return;
      }
      // Al convertir, el item pasa a in_production — ya no es una idea, así
      // que la flecha de "volver" del editor debe llevar a Pipeline (su
      // nuevo estado), no a Ideas (donde ya no aparecería).
      router.push(`/contenido/${id}?from=pipeline`);
    });
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Busca una idea..."
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Button size="sm" className="ml-auto h-9 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nueva idea
        </Button>
      </div>

      {ideas.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 py-12 text-center">
          <Lightbulb className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Todavía no hay ideas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) => (
            <div key={idea.id} className="surface-card flex flex-col gap-2 p-4">
              <p className="text-sm font-medium line-clamp-2">{idea.title}</p>
              {idea.main_idea && (
                <p className="text-xs text-muted-foreground line-clamp-3">{idea.main_idea}</p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="mt-auto h-7 w-fit gap-1.5 text-xs"
                onClick={() => handleConvert(idea.id)}
              >
                Convertir a guion
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Idea (opcional)</Label>
              <Textarea value={newIdea} onChange={(e) => setNewIdea(e.target.value)} className="min-h-20 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate}>
              Crear idea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
