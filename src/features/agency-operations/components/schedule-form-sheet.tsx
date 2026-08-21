"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createScheduleBlock, updateScheduleBlock, deleteScheduleBlock } from "../services/schedule-actions";
import { CONTENT_MAX_LENGTH } from "../services/schedule-schemas";
import { formatHourRange } from "../services/schedule-format";
import { SCHEDULE_COLOR_STYLES } from "./schedule-colors";
import {
  SCHEDULE_COLOR_KEYS,
  SCHEDULE_HOURS,
  SCHEDULE_WEEKDAYS,
  SCHEDULE_WEEKDAY_LABELS,
  type AgencyScheduleBlockWithResponsible,
  type ResponsiblesDirectoryState,
  type ScheduleColorKey,
  type ScheduleWeekday,
} from "../types";

const UNASSIGNED = "none";
// Sufijo cuando el directorio YA terminó de cargar (status "ready") y el
// responsable actual del bloque no está en esa lista activa: ahí sí se sabe
// con certeza que pasó a is_active=false.
const HISTORICAL_SUFFIX = " · Histórico (inactivo)";
// Sufijo cuando el directorio SIGUE cargando o falló (status "loading"/
// "error"): no hay datos fiables para afirmar que está inactivo — solo se
// sabe que es la asignación que el bloque ya tenía.
const CURRENT_ASSIGNMENT_SUFFIX = " · Asignación actual";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: AgencyScheduleBlockWithResponsible | null;
  initialWeekday: ScheduleWeekday;
  initialHour: number;
  responsiblesDirectory: ResponsiblesDirectoryState;
  onSaved: () => void;
  onDeleted: () => void;
}

export function ScheduleFormSheet({
  open,
  onOpenChange,
  block,
  initialWeekday,
  initialHour,
  responsiblesDirectory,
  onSaved,
  onDeleted,
}: Props) {
  const isEdit = Boolean(block);

  const [weekday, setWeekday] = useState<ScheduleWeekday>(initialWeekday);
  const [hour, setHour] = useState(initialHour);
  const [content, setContent] = useState("");
  const [colorKey, setColorKey] = useState<ScheduleColorKey>("teal");
  const [responsibleId, setResponsibleId] = useState<string>(UNASSIGNED);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reinicia el formulario cada vez que se abre — nunca arrastra datos de la
  // apertura anterior (mismo patrón que GoalFormSheet).
  useEffect(() => {
    if (!open) return;
    if (block) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets form fields from the block prop whenever the sheet opens, an intentional prop-driven reset
      setWeekday(block.weekday);
      setHour(block.hour);
      setContent(block.content);
      setColorKey(block.color_key);
      setResponsibleId(block.responsible_id ?? UNASSIGNED);
    } else {
      setWeekday(initialWeekday);
      setHour(initialHour);
      setContent("");
      setColorKey("teal");
      setResponsibleId(UNASSIGNED);
    }
    setConfirmingDelete(false);
  }, [open, block, initialWeekday, initialHour]);

  // El responsable actual de ESTE bloque, si no aparece en la lista activa
  // recién resuelta, se añade únicamente a la lista de ESTE formulario —
  // nunca queda disponible para asignarlo a otro bloque ni en creación,
  // porque esta lista se recalcula a partir de `block`, que es distinto
  // cada vez. Mientras el directorio no esté "ready" (loading/error), se
  // trata como si no hubiera ningún responsable activo conocido todavía —
  // en creación esto deja disponible únicamente "Sin asignar". La etiqueta
  // depende de si el directorio YA terminó ("ready" → histórico/inactivo
  // confirmado) o todavía no se sabe ("loading"/"error" → solo se afirma
  // que es la asignación actual).
  const selectableResponsibles = useMemo(() => {
    const responsibles = responsiblesDirectory.status === "ready" ? responsiblesDirectory.responsibles : [];
    if (block?.responsible_id && block.responsible && !responsibles.some((r) => r.id === block.responsible_id)) {
      const suffix = responsiblesDirectory.status === "ready" ? HISTORICAL_SUFFIX : CURRENT_ASSIGNMENT_SUFFIX;
      return [...responsibles, { id: block.responsible_id, full_name: `${block.responsible.full_name}${suffix}` }];
    }
    return responsibles;
  }, [block, responsiblesDirectory]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || deleting) return;
    setSaving(true);
    try {
      const payload = {
        weekday,
        hour,
        content,
        color_key: colorKey,
        responsible_id: responsibleId === UNASSIGNED ? null : responsibleId,
      };

      // El responsible_id actual (histórico incluido) se envía siempre tal
      // cual — TAREA 4A.1 en updateScheduleBlock ya sabe no revalidar "estar
      // activo" cuando coincide con el que la fila ya tenía.
      const result = isEdit && block ? await updateScheduleBlock(block.id, payload) : await createScheduleBlock(payload);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(isEdit ? "Bloque actualizado" : "Bloque creado");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!block || deleting) return;
    setDeleting(true);
    try {
      const result = await deleteScheduleBlock(block.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Bloque de horario eliminado");
      onDeleted();
      onOpenChange(false);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const contentTrimmedEmpty = content.trim().length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar bloque de horario" : "Nuevo bloque de horario"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Actualiza el día, la hora o el contenido de este bloque." : "Horario interno: a qué hora te conectas y qué trabajo tienes previsto."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-weekday">Día</Label>
              <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v) as ScheduleWeekday)}>
                <SelectTrigger id="schedule-weekday">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_WEEKDAYS.map((wd) => (
                    <SelectItem key={wd} value={String(wd)}>
                      {SCHEDULE_WEEKDAY_LABELS[wd]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="schedule-hour">Hora</Label>
              <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                <SelectTrigger id="schedule-hour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {formatHourRange(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="schedule-content">Actividad o trabajo previsto</Label>
              <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                {content.length}/{CONTENT_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              id="schedule-content"
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, CONTENT_MAX_LENGTH))}
              maxLength={CONTENT_MAX_LENGTH}
              rows={4}
              required
              placeholder="Ej.: Reunión de equipo, atención a clientes, revisión de propuestas…"
            />
          </div>

          <div className="space-y-1.5">
            <Label id="schedule-color-label">Color</Label>
            <div role="group" aria-labelledby="schedule-color-label" className="flex flex-wrap gap-2">
              {SCHEDULE_COLOR_KEYS.map((key) => {
                const style = SCHEDULE_COLOR_STYLES[key];
                const selected = colorKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setColorKey(key)}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
                    {style.label}
                    {selected && <Check className="h-3 w-3 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schedule-responsible">Responsable (opcional)</Label>
            <Select value={responsibleId} onValueChange={setResponsibleId}>
              <SelectTrigger id="schedule-responsible">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
                {selectableResponsibles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isEdit && (
            <div className="mt-2 border-t border-border pt-4">
              {confirmingDelete ? (
                <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-foreground">¿Eliminar este bloque de horario?</p>
                  <p className="text-xs text-muted-foreground">Se perderá el texto y no se puede deshacer.</p>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" disabled={deleting} onClick={() => setConfirmingDelete(false)}>
                      No, mantener el bloque
                    </Button>
                    <Button type="button" variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
                      {deleting ? "Eliminando…" : "Sí, eliminar"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={saving || deleting}
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Eliminar bloque
                </Button>
              )}
            </div>
          )}

          <SheetFooter className="mt-auto pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || deleting || contentTrimmedEmpty}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear bloque"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
