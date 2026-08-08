"use client";

/**
 * note-editor.tsx — Anotaciones (Fase 2). Editor de texto enriquecido con
 * Tiptap/ProseMirror. El formato es deliberadamente simple (H1-H3, párrafo,
 * listas, negrita/cursiva, enlaces, alineación básica) porque ESE es el
 * mecanismo de sanitización: el esquema de extensiones habilitadas es lo
 * único que el editor puede representar, así que pegar HTML de Word (u
 * cualquier otra fuente) nunca puede introducir marcado ni estilos fuera de
 * esa lista — ProseMirror descarta silenciosamente cualquier nodo/mark que
 * el esquema activo no reconozca. `transformPastedHTML` de abajo solo quita
 * ruido evidente de Word (comentarios condicionales, namespaces `o:`/`w:`)
 * antes de esa conversión, como limpieza adicional, no como el mecanismo
 * principal de seguridad.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Bold,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Pilcrow,
} from "lucide-react";
import { duplicateNote, renameNote, updateNoteContent } from "@/features/notes/services/note-actions";
import type { NoteRow } from "@/features/projects/types";

const SAVE_DEBOUNCE_MS = 2000;

// No @tailwindcss/typography plugin in this repo — style descendants
// directly with the design system's own tokens instead of pulling in a new
// global CSS dependency for one editor.
const EDITOR_CONTENT_CLASS = [
  "min-h-[60vh] max-w-none px-1 text-sm text-foreground focus:outline-none",
  "[&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-2",
  "[&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2",
  "[&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5",
  "[&_p]:my-2 [&_p]:leading-relaxed",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_strong]:font-semibold",
  "[&_p.is-editor-empty:first-child::before]:text-muted-foreground [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:h-0",
].join(" ");

function stripWordCruft(html: string): string {
  return html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[ow]:[a-z]+[^>]*>/gi, "");
}

interface Props {
  note: NoteRow;
}

export function NoteEditor({ note }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [duplicating, setDuplicating] = useState(false);
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        code: false,
      }),
      TiptapLink.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right"] }),
      Placeholder.configure({ placeholder: "Escribe algo..." }),
    ],
    content: safeInitialContent(note.content),
    editorProps: {
      transformPastedHTML: stripWordCruft,
      attributes: {
        class: EDITOR_CONTENT_CLASS,
      },
    },
    onUpdate: () => {
      setSaveState("unsaved");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setSaveState("saving");
        startTransition(async () => {
          const json = editor?.getJSON();
          if (!json) return;
          const result = await updateNoteContent(note.workspace_id, note.id, json as never);
          if (!result.ok) {
            setSaveState("unsaved");
            toast.error(result.error ?? "Error al guardar el documento");
            return;
          }
          setSaveState("saved");
        });
      }, SAVE_DEBOUNCE_MS);
    },
  });

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleRename() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === note.title) {
      setTitle(note.title);
      return;
    }
    startTransition(async () => {
      const result = await renameNote(note.workspace_id, note.id, trimmed);
      if (!result.ok) {
        toast.error(result.error ?? "Error al renombrar");
        setTitle(note.title);
      }
    });
  }

  function handleDuplicate() {
    setDuplicating(true);
    startTransition(async () => {
      const result = await duplicateNote(note.id);
      setDuplicating(false);
      if (!result.ok) {
        toast.error(result.error ?? "Error al duplicar el documento");
        return;
      }
      toast.success("Documento duplicado");
      router.push(`/anotaciones/${result.data.id}`);
    });
  }

  function handleSetLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL del enlace", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  if (!editor) return null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/proyectos?view=notes" aria-label="Volver a Anotaciones">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleRename}
          className="h-8 max-w-xs text-sm font-medium"
        />
        <span className="text-xs text-muted-foreground">
          {saveState === "saving" && "Guardando…"}
          {saveState === "saved" && "Guardado"}
          {saveState === "unsaved" && "Cambios sin guardar"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 text-muted-foreground"
          onClick={handleDuplicate}
          disabled={duplicating}
          aria-label="Duplicar documento"
          title="Duplicar documento"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border/40 px-4 py-1.5">
        <ToolbarButton active={editor.isActive("paragraph")} label="Párrafo" onClick={() => editor.chain().focus().setParagraph().run()}>
          <Pilcrow className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 1 })} label="Título 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 2 })} label="Título 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 3 })} label="Título 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <ToolbarButton active={editor.isActive("bold")} label="Negrita" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} label="Cursiva" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("link")} label="Enlace" onClick={handleSetLink}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <ToolbarButton active={editor.isActive("bulletList")} label="Lista con viñetas" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} label="Lista numerada" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <ToolbarButton active={editor.isActive({ textAlign: "left" })} label="Alinear a la izquierda" onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "center" })} label="Centrar" onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "right" })} label="Alinear a la derecha" onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", active && "bg-muted text-foreground")}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      {children}
    </Button>
  );
}

// A corrupt/unexpected content shape must never crash the editor — fall
// back to an empty document instead of throwing during useEditor's initial
// Node.fromJSON.
function safeInitialContent(content: unknown) {
  try {
    if (content && typeof content === "object" && (content as { type?: string }).type === "doc") {
      return content as never;
    }
  } catch {
    // fall through
  }
  return { type: "doc", content: [{ type: "paragraph" }] } as never;
}
