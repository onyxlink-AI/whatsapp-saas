"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Users, Repeat, Euro, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "./kpi-card";
import { ClientsTable } from "./clients-table";
import { RelationshipFormSheet } from "./relationship-form-sheet";
import { MeetingsTable } from "./meetings-table";
import { MeetingFormSheet } from "./meeting-form-sheet";
import { listClientRelationships, listSalesMeetings, listAllWorkspaces } from "../services/kpi-queries";
import { deleteClientRelationship, deleteSalesMeeting } from "../services/kpi-actions";
import {
  countActiveClients,
  computeRetentionKpi,
  computeAverageTicketKpi,
  computeMeetingsClosureKpi,
  computeRegistrableWorkspaces,
} from "../services/kpi-calculations";
import { formatEur } from "../services/kpi-format";
import { todayLocalIso } from "@/features/agency-goals/services/period-calculator";
import type { AgencyClientRelationshipWithWorkspace, AgencySalesMeetingRow, RegistrableWorkspace } from "../types";

const SIN_DATOS = "Sin datos suficientes";

export function KpiBoard() {
  const [relationships, setRelationships] = useState<AgencyClientRelationshipWithWorkspace[] | null>(null);
  const [meetings, setMeetings] = useState<AgencySalesMeetingRow[] | null>(null);
  const [workspaces, setWorkspaces] = useState<RegistrableWorkspace[]>([]);
  const [loadingRelationships, setLoadingRelationships] = useState(true);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [relationshipsError, setRelationshipsError] = useState<string | null>(null);
  const [meetingsError, setMeetingsError] = useState<string | null>(null);

  const [relationshipFormOpen, setRelationshipFormOpen] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<AgencyClientRelationshipWithWorkspace | null>(null);
  const [deletingRelationshipId, setDeletingRelationshipId] = useState<string | null>(null);

  const [meetingFormOpen, setMeetingFormOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<AgencySalesMeetingRow | null>(null);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);

  const todayIso = useMemo(() => todayLocalIso(), []);

  const loadRelationships = useCallback(async () => {
    setLoadingRelationships(true);
    setRelationshipsError(null);
    const result = await listClientRelationships();
    if (result.ok) setRelationships(result.data);
    else setRelationshipsError(result.error);
    setLoadingRelationships(false);
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoadingMeetings(true);
    setMeetingsError(null);
    const result = await listSalesMeetings();
    if (result.ok) setMeetings(result.data);
    else setMeetingsError(result.error);
    setLoadingMeetings(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount, same established pattern as objetivos-board.tsx/reminders-tab.tsx
    loadRelationships();
    loadMeetings();
    listAllWorkspaces().then((result) => {
      if (result.ok) setWorkspaces(result.data);
    });
  }, [loadRelationships, loadMeetings]);

  const registrableWorkspaces = useMemo(
    () => (relationships ? computeRegistrableWorkspaces(workspaces, relationships) : []),
    [workspaces, relationships],
  );

  // Los 4 KPI se derivan SIEMPRE de estas mismas dos listas ya cargadas para
  // las tablas — nunca una petición aparte por tarjeta (evita N+1) y nunca
  // una fórmula reimplementada aquí (kpi-calculations.ts es la única fuente).
  const clientsCount = useMemo(() => (relationships ? countActiveClients(relationships, todayIso) : 0), [relationships, todayIso]);
  const retention = useMemo(() => (relationships ? computeRetentionKpi(relationships, todayIso) : { averageDays: null, averageMonths: null }), [relationships, todayIso]);
  const ticket = useMemo(() => (relationships ? computeAverageTicketKpi(relationships, todayIso) : { averageEur: null, countWithFee: 0 }), [relationships, todayIso]);
  const closure = useMemo(() => (meetings ? computeMeetingsClosureKpi(meetings) : { ratePercent: null, won: 0, resolvedTotal: 0 }), [meetings]);

  function handleCreateRelationship() {
    setEditingRelationship(null);
    setRelationshipFormOpen(true);
  }

  function handleEditRelationship(relationship: AgencyClientRelationshipWithWorkspace) {
    setEditingRelationship(relationship);
    setRelationshipFormOpen(true);
  }

  async function handleDeleteRelationship(id: string) {
    setDeletingRelationshipId(id);
    const result = await deleteClientRelationship(id);
    setDeletingRelationshipId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Cliente eliminado");
    loadRelationships();
  }

  function handleCreateMeeting() {
    setEditingMeeting(null);
    setMeetingFormOpen(true);
  }

  function handleEditMeeting(meeting: AgencySalesMeetingRow) {
    setEditingMeeting(meeting);
    setMeetingFormOpen(true);
  }

  async function handleDeleteMeeting(id: string) {
    setDeletingMeetingId(id);
    const result = await deleteSalesMeeting(id);
    setDeletingMeetingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Reunión eliminada");
    loadMeetings();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Dirección" title="KPI" description="Métricas internas de dirección, con datos reales introducidos por el equipo." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Clientes" icon={Users} value={String(clientsCount)} helpText="Relaciones activas hoy" />
        <KpiCard
          label="Retención"
          icon={Repeat}
          value={retention.averageMonths === null ? SIN_DATOS : `${retention.averageMonths.toFixed(1)} meses`}
          helpText={retention.averageDays === null ? undefined : `Media exacta: ${retention.averageDays.toFixed(1)} días`}
        />
        <KpiCard
          label="Ticket medio"
          icon={Euro}
          value={ticket.averageEur === null ? SIN_DATOS : formatEur(ticket.averageEur)}
          helpText={`${ticket.countWithFee} cliente${ticket.countWithFee === 1 ? "" : "s"} con cuota conocida`}
        />
        <KpiCard
          label="Cierre de reuniones"
          icon={CheckCircle2}
          value={closure.ratePercent === null ? SIN_DATOS : `${closure.ratePercent.toFixed(1)}%`}
          helpText={
            closure.resolvedTotal === 0
              ? undefined
              : `${closure.won} cierre${closure.won === 1 ? "" : "s"} de ${closure.resolvedTotal} reunion${closure.resolvedTotal === 1 ? "" : "es"} resuelta${closure.resolvedTotal === 1 ? "" : "s"}`
          }
        />
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Clientes y retención</TabsTrigger>
          <TabsTrigger value="meetings">Reuniones de ventas</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="surface-card overflow-hidden">
          <div className="flex items-center justify-end p-3">
            <Button size="sm" onClick={handleCreateRelationship}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo cliente
            </Button>
          </div>
          <ClientsTable
            relationships={relationships ?? []}
            loading={loadingRelationships}
            error={relationshipsError}
            todayIso={todayIso}
            onEdit={handleEditRelationship}
            onDelete={handleDeleteRelationship}
            deletingId={deletingRelationshipId}
          />
        </TabsContent>

        <TabsContent value="meetings" className="surface-card overflow-hidden">
          <div className="flex items-center justify-end p-3">
            <Button size="sm" onClick={handleCreateMeeting}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva reunión
            </Button>
          </div>
          <MeetingsTable
            meetings={meetings ?? []}
            loading={loadingMeetings}
            error={meetingsError}
            onEdit={handleEditMeeting}
            onDelete={handleDeleteMeeting}
            deletingId={deletingMeetingId}
          />
        </TabsContent>
      </Tabs>

      <RelationshipFormSheet
        open={relationshipFormOpen}
        onOpenChange={setRelationshipFormOpen}
        relationship={editingRelationship}
        registrableWorkspaces={registrableWorkspaces}
        onSaved={loadRelationships}
      />
      <MeetingFormSheet open={meetingFormOpen} onOpenChange={setMeetingFormOpen} meeting={editingMeeting} onSaved={loadMeetings} />
    </div>
  );
}
