"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Plus, Search, Archive, ArchiveRestore, Copy, MoreVertical } from "lucide-react";
import {
  createNote,
  duplicateNote,
  setNoteArchived,
} from "@/features/notes/services/note-actions";
import { NOTE_TEMPLATES } from "@/features/notes/lib/templates";
import type { NoteRow } from "@/features/projects/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotesListProps {
  workspaceId: string;
  initialNotes: NoteRow[];
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

export function NotesList({ workspaceId, initialNotes }: NotesListProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let list = notes.filter((n) => (showArchived ? n.archived_at !== null : n.archived_at === null));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((n) => n.title.toLowerCase().includes(q));
    }
    return list;
  }, [notes, search, showArchived]);

  function handleCreate(templateId: (typeof NOTE_TEMPLATES)[number]) {
    startTransition(async () => {
      const result = await createNote(workspaceId, {
        title: templateId.id === "blank" ? "Sin título" : templateId.label,
        template: templateId.id,
        content: templateId.content,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Error al crear el documento");
        return;
      }
      setGalleryOpen(false);
      router.push(`/anotaciones/${result.data.id}`);
    });
  }

  function handleDuplicate(noteId: string) {
    startTransition(async () => {
      const result = await duplicateNote(noteId);
      if (!result.ok) {
        toast.error(result.error ?? "Error al duplicar");
        return;
      }
      toast.success("Documento duplicado");
      router.refresh();
    });
  }

  function handleArchive(noteId: string, archived: boolean) {
    startTransition(async () => {
      const result = await setNoteArchived(workspaceId, noteId, archived);
      if (!result.ok) {
        toast.error(result.error ?? "Error al archivar");
        return;
      }
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, archived_at: archived ? new Date().toISOString() : null } : n)),
      );
      toast.success(archived ? "Documento archivado" : "Documento restaurado");
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
            placeholder="Busca un documento..."
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Button
          variant={showArchived ? "secondary" : "outline"}
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={() => setShowArchived((v) => !v)}
        >
          <Archive className="h-3.5 w-3.5" />
          {showArchived ? "Viendo archivados" : "Archivados"}
        </Button>
        <Button size="sm" className="ml-auto h-9 gap-1.5 text-xs" onClick={() => setGalleryOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nuevo documento
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 py-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {showArchived ? "No hay documentos archivados" : "Todavía no hay documentos"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((note) => (
            <div
              key={note.id}
              className="surface-card flex items-start justify-between gap-2 p-4 transition-colors hover:border-[hsl(var(--electric-lime)/0.4)]"
            >
              <button
                type="button"
                onClick={() => router.push(`/anotaciones/${note.id}`)}
                className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{note.title}</p>
                  <p className="text-xs text-muted-foreground">Actualizado {formatDate(note.updated_at)}</p>
                </div>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label="Más opciones">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDuplicate(note.id)}>
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </DropdownMenuItem>
                  {note.archived_at ? (
                    <DropdownMenuItem onClick={() => handleArchive(note.id, false)}>
                      <ArchiveRestore className="h-3.5 w-3.5" /> Restaurar
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => handleArchive(note.id, true)}>
                      <Archive className="h-3.5 w-3.5" /> Archivar
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo documento</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {NOTE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleCreate(t)}
                className="surface-subtle flex flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors hover:border-[hsl(var(--electric-lime)/0.4)]"
              >
                <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="text-xs font-medium">{t.label}</span>
                <span className="text-[10px] text-muted-foreground">{t.description}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
