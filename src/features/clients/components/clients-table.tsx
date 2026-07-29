"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Download, Loader2 } from "lucide-react";
import {
  deleteClientRecord,
  deleteClientRecords,
  getClient,
  listClients,
} from "@/features/clients/services/client-actions";
import { useClientsFiltersStore } from "@/features/clients/store/clients-filters-store";
import {
  CLIENT_STATUS_LABELS,
  type ClientRow,
  type ClientStatus,
} from "@/features/clients/types";
import { ClientFormDialog } from "./client-form-dialog";
import { exportClientsToExcel } from "../lib/export";

const STATUS_BADGE_VARIANT: Record<ClientStatus, "default" | "secondary" | "outline"> = {
  activo: "default",
  potencial: "secondary",
  archivado: "outline",
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

interface ClientsTableProps {
  workspaceId: string;
  initialClients: ClientRow[];
  initialOpenClientId?: string | null;
}

export function ClientsTable({
  workspaceId,
  initialClients,
  initialOpenClientId,
}: ClientsTableProps) {
  const [clients, setClients] = useState(initialClients);
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const search = useClientsFiltersStore((s) => s.search);
  const status = useClientsFiltersStore((s) => s.status);
  const setSearch = useClientsFiltersStore((s) => s.setSearch);
  const setStatus = useClientsFiltersStore((s) => s.setStatus);

  async function refresh() {
    const data = await listClients(workspaceId, { search, status });
    setClients(data);
    setSelectedIds(new Set());
  }

  // Deep-link from the global search palette (?open=<id>) — the target
  // client may not be in the initially loaded/filtered page, so fetch it
  // directly rather than looking it up in `clients`.
  useEffect(() => {
    if (!initialOpenClientId) return;
    getClient(initialOpenClientId).then((client) => {
      if (client) {
        setEditingClient(client);
        setFormOpen(true);
      }
    });
  }, [initialOpenClientId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      refresh();
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const rows = useMemo(() => clients, [clients]);

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreate() {
    setEditingClient(null);
    setFormOpen(true);
  }

  function handleEdit(client: ClientRow) {
    setEditingClient(client);
    setFormOpen(true);
  }

  function handleDelete(client: ClientRow) {
    const ok = window.confirm(
      `¿Eliminar a ${client.name || client.phone}? También se borran sus mensajes, negocios y tareas. No se puede deshacer.`,
    );
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteClientRecord(client.id);
      if (!result.ok) {
        toast.error(result.error ?? "Error al eliminar el cliente");
        return;
      }
      toast.success("Cliente eliminado");
      setClients((prev) => prev.filter((c) => c.id !== client.id));
    });
  }

  function handleBulkDelete() {
    const count = selectedIds.size;
    const ok = window.confirm(
      `¿Eliminar ${count} cliente${count === 1 ? "" : "s"}? También se borran sus mensajes, negocios y tareas. No se puede deshacer.`,
    );
    if (!ok) return;

    const ids = Array.from(selectedIds);
    startTransition(async () => {
      const result = await deleteClientRecords(ids);
      if (!result.ok) {
        toast.error(result.error ?? "Error al eliminar los clientes");
        return;
      }
      toast.success(`${count} cliente${count === 1 ? "" : "s"} eliminado${count === 1 ? "" : "s"}`);
      setClients((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    });
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      const toExport = selectedIds.size > 0
        ? rows.filter((c) => selectedIds.has(c.id))
        : rows;
      await exportClientsToExcel(toExport);
    } catch (err) {
      console.error("[handleExport] error:", err);
      toast.error("Error al exportar");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Busca un cliente..."
          className="h-9 w-64 text-xs"
        />

        <Tabs value={status} onValueChange={(v) => setStatus(v as ClientStatus | "all")}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="activo">Activos</TabsTrigger>
            <TabsTrigger value="potencial">Potenciales</TabsTrigger>
            <TabsTrigger value="archivado">Archivados</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 ml-auto">
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 gap-1.5 text-xs text-destructive"
              onClick={handleBulkDelete}
              disabled={isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar ({selectedIds.size})
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 text-xs"
            onClick={handleExport}
            disabled={isExporting || rows.length === 0}
            aria-busy={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {isExporting
              ? "Exportando..."
              : selectedIds.size > 0
                ? `Exportar (${selectedIds.size})`
                : "Exportar"}
          </Button>

          <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
            Nuevo cliente
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Seleccionar todos"
                />
              </TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden sm:table-cell">Empresa</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden md:table-cell">Creado</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                  👥 Todavía no tienes clientes
                </TableCell>
              </TableRow>
            )}
            {rows.map((client) => (
              <TableRow
                key={client.id}
                className="cursor-pointer"
                data-state={selectedIds.has(client.id) ? "selected" : undefined}
                onClick={() => handleEdit(client)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(client.id)}
                    onCheckedChange={() => toggleOne(client.id)}
                    aria-label={`Seleccionar ${client.name ?? client.phone}`}
                  />
                </TableCell>
                <TableCell className="font-medium text-sm">
                  {client.name || "Sin nombre"}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                  {client.company?.name ?? "—"}
                </TableCell>
                <TableCell className="text-sm font-mono">{client.phone}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {client.email ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[client.client_status]} className="text-[10px]">
                    {CLIENT_STATUS_LABELS[client.client_status]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {formatDate(client.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Editar ${client.name || client.phone}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(client);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      aria-label={`Eliminar ${client.name || client.phone}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(client);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ClientFormDialog
        open={formOpen}
        workspaceId={workspaceId}
        client={editingClient}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />
    </div>
  );
}
