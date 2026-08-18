"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIsoDateTime } from "../services/kpi-format";
import { MEETING_STATUS_LABELS, MEETING_OUTCOME_LABELS, type AgencySalesMeetingRow } from "../types";

interface Props {
  meetings: AgencySalesMeetingRow[];
  loading: boolean;
  error: string | null;
  onEdit: (meeting: AgencySalesMeetingRow) => void;
  onDelete: (meetingId: string) => void;
  deletingId: string | null;
}

function OutcomeCell({ outcome }: { outcome: AgencySalesMeetingRow["outcome"] }) {
  if (!outcome) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = outcome === "won" ? "text-success" : outcome === "lost" ? "text-destructive" : "text-muted-foreground";
  return <span className={`text-xs font-medium ${tone}`}>{MEETING_OUTCOME_LABELS[outcome]}</span>;
}

function RowActions({
  meeting,
  onEdit,
  onDelete,
  deleting,
}: {
  meeting: AgencySalesMeetingRow;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="destructive"
          className="h-8 px-2 text-xs"
          disabled={deleting}
          onClick={() => {
            setConfirming(false);
            onDelete();
          }}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Eliminar
        </Button>
        <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={deleting} onClick={() => setConfirming(false)}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar reunión con «${meeting.lead_name}»`} onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Eliminar reunión con «${meeting.lead_name}»`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function MeetingsTable({ meetings, loading, error, onEdit, onDelete, deletingId }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 p-2" role="status" aria-live="polite">
        <span className="sr-only">Cargando reuniones…</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
        <p className="text-sm font-medium text-destructive">No se pudieron cargar las reuniones</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-foreground">Todavía no hay reuniones registradas</p>
        <p className="text-xs text-muted-foreground">Crea la primera con «Nueva reunión».</p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {meetings.map((meeting) => (
              <TableRow key={meeting.id}>
                <TableCell className="max-w-[12rem] truncate text-sm font-medium text-foreground">{meeting.lead_name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatIsoDateTime(meeting.scheduled_at)}</TableCell>
                <TableCell className="text-xs text-foreground">{MEETING_STATUS_LABELS[meeting.status]}</TableCell>
                <TableCell>
                  <OutcomeCell outcome={meeting.outcome} />
                </TableCell>
                <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">{meeting.notes || "—"}</TableCell>
                <TableCell>
                  <RowActions
                    meeting={meeting}
                    onEdit={() => onEdit(meeting)}
                    onDelete={() => onDelete(meeting.id)}
                    deleting={deletingId === meeting.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 p-2 md:hidden">
        {meetings.map((meeting) => (
          <div key={meeting.id} className="surface-subtle space-y-3 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{meeting.lead_name}</p>
                <p className="text-xs text-muted-foreground">{formatIsoDateTime(meeting.scheduled_at)}</p>
              </div>
              <RowActions
                meeting={meeting}
                onEdit={() => onEdit(meeting)}
                onDelete={() => onDelete(meeting.id)}
                deleting={deletingId === meeting.id}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground">{MEETING_STATUS_LABELS[meeting.status]}</span>
              <OutcomeCell outcome={meeting.outcome} />
            </div>
            {meeting.notes && <p className="truncate text-xs text-muted-foreground">{meeting.notes}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
