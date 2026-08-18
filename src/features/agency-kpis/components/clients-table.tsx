"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X, CheckCircle2, Clock3, Building2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { isClientActiveOn, retentionDaysFor } from "../services/kpi-calculations";
import { formatEur, formatIsoDate } from "../services/kpi-format";
import type { AgencyClientRelationshipWithWorkspace } from "../types";

interface Props {
  relationships: AgencyClientRelationshipWithWorkspace[];
  loading: boolean;
  error: string | null;
  todayIso: string;
  onEdit: (relationship: AgencyClientRelationshipWithWorkspace) => void;
  onDelete: (relationshipId: string) => void;
  deletingId: string | null;
}

function StatusCell({ relationship, todayIso }: { relationship: AgencyClientRelationshipWithWorkspace; todayIso: string }) {
  if (isClientActiveOn(relationship, todayIso)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Activo
      </span>
    );
  }
  if (relationship.service_ended_on) {
    return <span className="text-xs text-muted-foreground">{formatIsoDate(relationship.service_ended_on)}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
      Aún no iniciado
    </span>
  );
}

function RetentionCell({ relationship, todayIso }: { relationship: AgencyClientRelationshipWithWorkspace; todayIso: string }) {
  const days = retentionDaysFor(relationship, todayIso);
  if (days === null) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="text-xs font-medium tabular-nums text-foreground">{days} días</span>;
}

/** TAREA 3B: workspace.name mientras exista; si el workspace se borró
 * (workspace_id quedó NULL vía ON DELETE SET NULL), cae al respaldo
 * histórico client_name_snapshot, con un aviso discreto — nunca "Empresa
 * eliminada" a secas, que perdía el nombre real. */
function clientDisplayName(relationship: AgencyClientRelationshipWithWorkspace): string {
  return relationship.workspace?.name ?? relationship.client_name_snapshot;
}

function ClientNameCell({ relationship }: { relationship: AgencyClientRelationshipWithWorkspace }) {
  const workspaceGone = relationship.workspace === null;
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">{clientDisplayName(relationship)}</p>
      {workspaceGone && (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <TriangleAlert className="h-3 w-3" aria-hidden="true" />
          El workspace original ya no existe
        </span>
      )}
    </div>
  );
}

function RowActions({
  relationship,
  onEdit,
  onDelete,
  deleting,
}: {
  relationship: AgencyClientRelationshipWithWorkspace;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const label = clientDisplayName(relationship);

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
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar «${label}»`} onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Eliminar «${label}»`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function ClientsTable({ relationships, loading, error, todayIso, onEdit, onDelete, deletingId }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 p-2" role="status" aria-live="polite">
        <span className="sr-only">Cargando clientes…</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
        <p className="text-sm font-medium text-destructive">No se pudieron cargar los clientes</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (relationships.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-foreground">Todavía no hay clientes registrados</p>
        <p className="text-xs text-muted-foreground">Registra el primero con «Nuevo cliente».</p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Fin</TableHead>
              <TableHead>Retención</TableHead>
              <TableHead>Cuota mensual</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relationships.map((relationship) => (
              <TableRow key={relationship.id}>
                <TableCell className="max-w-[14rem]">
                  <ClientNameCell relationship={relationship} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatIsoDate(relationship.service_started_on)}</TableCell>
                <TableCell>
                  <StatusCell relationship={relationship} todayIso={todayIso} />
                </TableCell>
                <TableCell>
                  <RetentionCell relationship={relationship} todayIso={todayIso} />
                </TableCell>
                <TableCell className="text-xs tabular-nums text-foreground">
                  {relationship.monthly_fee === null ? <span className="text-muted-foreground">Sin informar</span> : formatEur(relationship.monthly_fee)}
                </TableCell>
                <TableCell>
                  <RowActions
                    relationship={relationship}
                    onEdit={() => onEdit(relationship)}
                    onDelete={() => onDelete(relationship.id)}
                    deleting={deletingId === relationship.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 p-2 md:hidden">
        {relationships.map((relationship) => (
          <div key={relationship.id} className={cn("surface-subtle space-y-3 rounded-lg p-3")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <ClientNameCell relationship={relationship} />
                <p className="text-xs text-muted-foreground">Desde {formatIsoDate(relationship.service_started_on)}</p>
              </div>
              <RowActions
                relationship={relationship}
                onEdit={() => onEdit(relationship)}
                onDelete={() => onDelete(relationship.id)}
                deleting={deletingId === relationship.id}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <StatusCell relationship={relationship} todayIso={todayIso} />
              <RetentionCell relationship={relationship} todayIso={todayIso} />
            </div>
            <p className="text-xs text-muted-foreground">
              Cuota: {relationship.monthly_fee === null ? "Sin informar" : formatEur(relationship.monthly_fee)}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
