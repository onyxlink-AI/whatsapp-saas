"use client";

/**
 * crm-panel.tsx — Collapsible CRM side panel for contact details.
 * Shows contact info, stage, tags, opt-in status with inline editing.
 */

import { useState, useTransition, KeyboardEvent } from "react";
import {
  User,
  RefreshCw,
  Save,
  ChevronDown,
  ChevronUp,
  X,
  Kanban,
  BrainCircuit,
  Trash2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateContact, syncContactHL } from "../services/contact-actions";
import {
  updateContactMemory,
  forgetContact,
} from "../services/contact-memory-actions";
import type { ContactRow } from "@/features/inbox/types";
import type { ContactMemory } from "../services/contact-memory";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type Stage = "new" | "engaged" | "qualified" | "customer" | "lost";

const STAGE_LABELS: Record<Stage, string> = {
  new: "Nuevo",
  engaged: "Interesado",
  qualified: "Calificado",
  customer: "Cliente",
  lost: "Perdido",
};

interface CrmPanelProps {
  contact: ContactRow;
  conversationId: string;
  advancedMemoryEnabled?: boolean;
  initialMemory?: ContactMemory | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Avatar helper
// ──────────────────────────────────────────────────────────────────────────────

function Initials({ name }: { name: string | null }) {
  const letters = name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "?";

  return (
    <div className="h-10 w-10 rounded-full bg-[hsl(var(--electric-lime)/0.15)] border border-[hsl(var(--electric-lime)/0.3)] flex items-center justify-center shrink-0">
      <span className="text-xs font-semibold text-[hsl(var(--electric-lime))] font-mono">
        {letters}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// CrmPanel
// ──────────────────────────────────────────────────────────────────────────────

export function CrmPanel({
  contact,
  conversationId: _conversationId,
  advancedMemoryEnabled = false,
  initialMemory = null,
}: CrmPanelProps) {
  const [isPending, startTransition] = useTransition();

  // Local editable state
  const [name, setName] = useState(contact.name ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [stage, setStage] = useState<Stage>(
    (contact.stage as Stage | null) ?? "new",
  );
  const [tags, setTags] = useState<string[]>(contact.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [optIn, setOptIn] = useState(contact.opt_in);

  // Section collapse
  const [contactOpen, setContactOpen] = useState(true);
  const [crmOpen, setCrmOpen] = useState(true);
  const [memoryOpen, setMemoryOpen] = useState(true);

  // Memoria Inteligente Avanzada (opt-in, Fase 2)
  const [hasMemoryRow, setHasMemoryRow] = useState(initialMemory != null);
  const [memorySummary, setMemorySummary] = useState(
    initialMemory?.summary ?? "",
  );
  const [memoryInterests, setMemoryInterests] = useState<string[]>(
    initialMemory?.interests ?? [],
  );
  const [memoryInterestInput, setMemoryInterestInput] = useState("");
  const [memoryObjections, setMemoryObjections] = useState<string[]>(
    initialMemory?.objections ?? [],
  );
  const [memoryObjectionInput, setMemoryObjectionInput] = useState("");
  const [memoryPreferences, setMemoryPreferences] = useState<
    { key: string; value: string }[]
  >(
    Object.entries(initialMemory?.preferences ?? {}).map(([key, value]) => ({
      key,
      value: String(value),
    })),
  );
  const [memoryLeadStatus, setMemoryLeadStatus] = useState(
    initialMemory?.lead_status ?? "",
  );
  const [memoryNextStep, setMemoryNextStep] = useState(
    initialMemory?.next_step ?? "",
  );

  // ── Tag helpers ──────────────────────────────────────────────────────────────

  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  }

  // ── Memoria helpers ──────────────────────────────────────────────────────────

  function addMemoryInterest() {
    const trimmed = memoryInterestInput.trim();
    if (trimmed && !memoryInterests.includes(trimmed)) {
      setMemoryInterests((prev) => [...prev, trimmed]);
    }
    setMemoryInterestInput("");
  }

  function removeMemoryInterest(interest: string) {
    setMemoryInterests((prev) => prev.filter((i) => i !== interest));
  }

  function addMemoryObjection() {
    const trimmed = memoryObjectionInput.trim();
    if (trimmed && !memoryObjections.includes(trimmed)) {
      setMemoryObjections((prev) => [...prev, trimmed]);
    }
    setMemoryObjectionInput("");
  }

  function removeMemoryObjection(objection: string) {
    setMemoryObjections((prev) => prev.filter((o) => o !== objection));
  }

  function addMemoryPreference() {
    setMemoryPreferences((prev) => [...prev, { key: "", value: "" }]);
  }

  function updateMemoryPreference(
    index: number,
    field: "key" | "value",
    value: string,
  ) {
    setMemoryPreferences((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  }

  function removeMemoryPreference(index: number) {
    setMemoryPreferences((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSaveMemory() {
    startTransition(async () => {
      const preferences = Object.fromEntries(
        memoryPreferences
          .filter((p) => p.key.trim())
          .map((p) => [p.key.trim(), p.value]),
      );

      const result = await updateContactMemory(contact.id, contact.workspace_id, {
        summary: memorySummary || null,
        interests: memoryInterests,
        preferences,
        objections: memoryObjections,
        lead_status: memoryLeadStatus || null,
        next_step: memoryNextStep || null,
      });

      if (result.ok) {
        setHasMemoryRow(true);
        toast.success("Memoria guardada");
      } else {
        toast.error(result.error ?? "Error al guardar la memoria");
      }
    });
  }

  function handleForgetContact() {
    if (
      !window.confirm(
        "¿Olvidar todo lo que sabemos de este contacto? No se puede deshacer.",
      )
    )
      return;

    startTransition(async () => {
      const result = await forgetContact(contact.id);

      if (result.ok) {
        setHasMemoryRow(false);
        setMemorySummary("");
        setMemoryInterests([]);
        setMemoryObjections([]);
        setMemoryPreferences([]);
        setMemoryLeadStatus("");
        setMemoryNextStep("");
        toast.success("Memoria del contacto olvidada");
      } else {
        toast.error(result.error ?? "Error al olvidar el contacto");
      }
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  function handleSave() {
    startTransition(async () => {
      const result = await updateContact(contact.id, {
        name: name || undefined,
        email: email || undefined,
        stage,
        tags,
        opt_in: optIn,
      });

      if (result.ok) {
        toast.success("Contacto actualizado");
      } else {
        toast.error(result.error ?? "Error al guardar");
      }
    });
  }

  // ── HL Sync ──────────────────────────────────────────────────────────────────

  function handleSyncHL() {
    startTransition(async () => {
      const result = await syncContactHL(contact.id, contact.workspace_id);

      if (result.ok) {
        toast.success(`Sincronizado con HighLevel (ID: ${result.data.hl_id})`);
      } else {
        toast.error(result.error ?? "Error al sincronizar");
      }
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <aside className="w-full md:w-72 shrink-0 flex flex-col gap-0 border-t md:border-t-0 md:border-l border-border/50 glass overflow-y-auto text-sm">
      {/* ── Section: Contact info ── */}
      <section>
        <button
          type="button"
          onClick={() => setContactOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 border-b border-border/40 hover:bg-muted/20 transition-colors"
        >
          <span className="text-xs font-semibold text-[hsl(var(--electric-lime))] uppercase tracking-wider">
            Contacto
          </span>
          {contactOpen ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        {contactOpen && (
          <div className="px-4 py-3 space-y-3">
            {/* Avatar + phone */}
            <div className="flex items-center gap-3">
              <Initials name={name || contact.name} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-mono truncate">
                  {contact.phone}
                </p>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-1">
              <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                Nombre
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sin nombre"
                className="h-7 text-xs"
              />
            </div>

            {/* Email */}
            <div className="space-y-1">
              <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                Email
              </Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@ejemplo.com"
                type="email"
                className="h-7 text-xs"
              />
            </div>

            {/* Opt-in switch */}
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                Recibe WhatsApp
              </Label>
              <Switch
                checked={optIn}
                onCheckedChange={setOptIn}
                aria-label="Recibe WhatsApp"
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Section: CRM ── */}
      <section>
        <button
          type="button"
          onClick={() => setCrmOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 border-b border-border/40 hover:bg-muted/20 transition-colors"
        >
          <span className="text-xs font-semibold text-[hsl(var(--electric-lime))] uppercase tracking-wider">
            Seguimiento
          </span>
          {crmOpen ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        {crmOpen && (
          <div className="px-4 py-3 space-y-3">
            {/* Stage */}
            <div className="space-y-1">
              <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                Etapa
              </Label>
              <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STAGE_LABELS) as Stage[]).map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                Etiquetas
              </Label>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-[10px] pr-1 gap-1"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        aria-label={`Eliminar etiqueta ${tag}`}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                placeholder="Agregar etiqueta..."
                className="h-7 text-xs"
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Section: Memoria (opt-in, Fase 2) ── */}
      {advancedMemoryEnabled && (
        <section>
          <button
            type="button"
            onClick={() => setMemoryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-b border-border/40 hover:bg-muted/20 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--electric-lime))] uppercase tracking-wider">
              <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
              Memoria
            </span>
            {memoryOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>

          {memoryOpen && (
            <div className="px-4 py-3 space-y-3">
              {!hasMemoryRow && (
                <p className="text-[10px] text-muted-foreground">
                  Todavía no hay nada guardado sobre este contacto. Se va
                  llenando solo con las conversaciones, o puedes escribirlo tú
                  aquí.
                </p>
              )}

              {/* Resumen */}
              <div className="space-y-1">
                <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                  Resumen
                </Label>
                <Textarea
                  value={memorySummary}
                  onChange={(e) => setMemorySummary(e.target.value)}
                  placeholder="Sin resumen todavía"
                  rows={3}
                  className="text-xs resize-none"
                />
              </div>

              {/* Intereses */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                  Intereses
                </Label>
                {memoryInterests.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {memoryInterests.map((interest) => (
                      <Badge
                        key={interest}
                        variant="secondary"
                        className="text-[10px] pr-1 gap-1"
                      >
                        {interest}
                        <button
                          type="button"
                          onClick={() => removeMemoryInterest(interest)}
                          aria-label={`Eliminar interés ${interest}`}
                          className="hover:text-destructive transition-colors"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Input
                  value={memoryInterestInput}
                  onChange={(e) => setMemoryInterestInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMemoryInterest();
                    }
                  }}
                  onBlur={addMemoryInterest}
                  placeholder="Agregar interés..."
                  className="h-7 text-xs"
                />
              </div>

              {/* Objeciones */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                  Objeciones
                </Label>
                {memoryObjections.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {memoryObjections.map((objection) => (
                      <Badge
                        key={objection}
                        variant="secondary"
                        className="text-[10px] pr-1 gap-1"
                      >
                        {objection}
                        <button
                          type="button"
                          onClick={() => removeMemoryObjection(objection)}
                          aria-label={`Eliminar objeción ${objection}`}
                          className="hover:text-destructive transition-colors"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Input
                  value={memoryObjectionInput}
                  onChange={(e) => setMemoryObjectionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMemoryObjection();
                    }
                  }}
                  onBlur={addMemoryObjection}
                  placeholder="Agregar objeción..."
                  className="h-7 text-xs"
                />
              </div>

              {/* Preferencias */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                  Preferencias
                </Label>
                {memoryPreferences.map((pref, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input
                      value={pref.key}
                      onChange={(e) =>
                        updateMemoryPreference(i, "key", e.target.value)
                      }
                      placeholder="clave"
                      className="h-7 text-xs flex-1"
                    />
                    <Input
                      value={pref.value}
                      onChange={(e) =>
                        updateMemoryPreference(i, "value", e.target.value)
                      }
                      placeholder="valor"
                      className="h-7 text-xs flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeMemoryPreference(i)}
                      aria-label="Eliminar preferencia"
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMemoryPreference}
                  className="h-6 text-[10px] gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Agregar preferencia
                </Button>
              </div>

              {/* Estado del lead */}
              <div className="space-y-1">
                <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                  Cómo va este contacto
                </Label>
                <Input
                  value={memoryLeadStatus}
                  onChange={(e) => setMemoryLeadStatus(e.target.value)}
                  placeholder="Ej: interesado, esperando precio"
                  className="h-7 text-xs"
                />
              </div>

              {/* Siguiente paso */}
              <div className="space-y-1">
                <Label className="text-[10px] text-[hsl(var(--electric-lime))] uppercase tracking-wider">
                  Siguiente paso
                </Label>
                <Input
                  value={memoryNextStep}
                  onChange={(e) => setMemoryNextStep(e.target.value)}
                  placeholder="Ej: agendar llamada"
                  className="h-7 text-xs"
                />
              </div>

              <Button
                size="sm"
                onClick={handleSaveMemory}
                disabled={isPending}
                className="w-full h-7 text-xs gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                Guardar memoria
              </Button>

              {hasMemoryRow && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleForgetContact}
                  disabled={isPending}
                  className="w-full h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Olvidar este contacto
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Actions ── */}
      <div className="px-4 py-3 border-t border-border/40 flex flex-col gap-2 mt-auto">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isPending}
          className="w-full h-7 text-xs gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSyncHL}
          disabled={isPending}
          className="w-full h-7 text-xs gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Sync HighLevel
        </Button>
        <Button
          size="sm"
          variant="outline"
          asChild
          className="w-full h-7 text-xs gap-1.5"
        >
          <Link href={`/pipeline?createFor=${contact.id}`}>
            <Kanban className="h-3.5 w-3.5" />
            Crear negocio
          </Link>
        </Button>
      </div>

      {/* Opt-out warning */}
      {!optIn && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30">
          <p className="text-[10px] text-destructive leading-snug">
            <strong>Este contacto no quiere recibir WhatsApp.</strong> No le
            vamos a escribir.
          </p>
        </div>
      )}
    </aside>
  );
}

// Re-export User icon for the toggle button in chat-thread
export { User };
