"use client";

import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSalesMeeting, updateSalesMeeting } from "../services/kpi-actions";
import { toDateTimeLocalValue, fromDateTimeLocalValue } from "../services/kpi-format";
import {
  MEETING_STATUSES,
  MEETING_OUTCOMES,
  MEETING_STATUS_LABELS,
  MEETING_OUTCOME_LABELS,
  type AgencySalesMeetingRow,
  type MeetingOutcome,
  type MeetingStatus,
} from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: AgencySalesMeetingRow | null;
  onSaved: () => void;
}

function defaultScheduledAt(): string {
  return toDateTimeLocalValue(new Date().toISOString());
}

export function MeetingFormSheet({ open, onOpenChange, meeting, onSaved }: Props) {
  const isEdit = Boolean(meeting);

  const [leadName, setLeadName] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt);
  const [status, setStatus] = useState<MeetingStatus>("scheduled");
  const [outcome, setOutcome] = useState<MeetingOutcome | "none">("none");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (meeting) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets form fields from the meeting prop whenever the sheet opens, an intentional prop-driven reset
      setLeadName(meeting.lead_name);
      setScheduledAt(toDateTimeLocalValue(meeting.scheduled_at));
      setStatus(meeting.status);
      setOutcome(meeting.outcome ?? "none");
      setNotes(meeting.notes ?? "");
    } else {
      setLeadName("");
      setScheduledAt(defaultScheduledAt());
      setStatus("scheduled");
      setOutcome("none");
      setNotes("");
    }
  }, [open, meeting]);

  function handleStatusChange(next: MeetingStatus) {
    setStatus(next);
    // Cambiar a un estado que no admite resultado limpia el resultado en el
    // propio formulario — evita que la interfaz permita enviar una
    // combinación que el servidor y PostgreSQL van a rechazar igualmente.
    if (next !== "held") setOutcome("none");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        lead_name: leadName,
        scheduled_at: fromDateTimeLocalValue(scheduledAt),
        status,
        outcome: outcome === "none" ? null : outcome,
        notes: notes || undefined,
      };

      const result = isEdit && meeting ? await updateSalesMeeting(meeting.id, payload) : await createSalesMeeting(payload);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(isEdit ? "Reunión actualizada" : "Reunión creada");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar reunión" : "Nueva reunión"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Actualiza los datos de la reunión comercial." : "Registra una reunión comercial con un lead."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
          <div className="space-y-1.5">
            <Label htmlFor="meeting-lead">Lead</Label>
            <Input id="meeting-lead" value={leadName} onChange={(e) => setLeadName(e.target.value)} required maxLength={200} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-scheduled">Fecha y hora</Label>
            <Input
              id="meeting-scheduled"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-status">Estado</Label>
            <Select value={status} onValueChange={(v) => handleStatusChange(v as MeetingStatus)}>
              <SelectTrigger id="meeting-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEETING_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{MEETING_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-outcome">Resultado</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as MeetingOutcome | "none")} disabled={status !== "held"}>
              <SelectTrigger id="meeting-outcome"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin resultado</SelectItem>
                {MEETING_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>{MEETING_OUTCOME_LABELS[o]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {status !== "held" && <p className="text-xs text-muted-foreground">Solo las reuniones realizadas tienen resultado.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-notes">Notas (opcional)</Label>
            <Textarea id="meeting-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <SheetFooter className="mt-auto pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !leadName.trim() || (status === "held" && outcome === "none")}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear reunión"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
