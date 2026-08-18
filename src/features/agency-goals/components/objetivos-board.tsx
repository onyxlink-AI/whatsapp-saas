"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { ObjetivosTable } from "./objetivos-table";
import { GoalFormSheet } from "./goal-form-sheet";
import { listGoals, listPlatformStaffUsers, updateGoal, deleteGoal } from "../services/goal-actions";
import { parseIsoDate } from "../services/period-calculator";
import {
  GOAL_PERIOD_TYPES,
  GOAL_PERIOD_TYPE_LABELS,
  type AgencyGoalOwner,
  type AgencyGoalWithOwner,
  type GoalPeriodType,
  type GoalStatus,
} from "../types";

type TabState = {
  goals: AgencyGoalWithOwner[] | null;
  loading: boolean;
  error: string | null;
};

const EMPTY_TAB_STATE: TabState = { goals: null, loading: false, error: null };

// Anual/trimestral/mensual sí se navegan por año (varios objetivos del mismo
// tipo se acumulan entre años). Semanal se deja fuera a propósito: una
// semana puede cruzar de un año a otro y filtrarla por año rompería ese caso
// límite que period-calculator.ts ya trata como una sola semana coherente.
const YEAR_FILTERABLE: GoalPeriodType[] = ["annual", "quarterly", "monthly"];

export function ObjetivosBoard() {
  const [activeTab, setActiveTab] = useState<GoalPeriodType>("annual");
  const [tabs, setTabs] = useState<Record<GoalPeriodType, TabState>>({
    annual: { ...EMPTY_TAB_STATE },
    quarterly: { ...EMPTY_TAB_STATE },
    monthly: { ...EMPTY_TAB_STATE },
    weekly: { ...EMPTY_TAB_STATE },
  });
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [staffUsers, setStaffUsers] = useState<AgencyGoalOwner[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<AgencyGoalWithOwner | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTab = useCallback(async (periodType: GoalPeriodType) => {
    setTabs((prev) => ({ ...prev, [periodType]: { ...prev[periodType], loading: true, error: null } }));
    const result = await listGoals(periodType);
    setTabs((prev) => ({
      ...prev,
      [periodType]: result.ok
        ? { goals: result.data, loading: false, error: null }
        : { goals: null, loading: false, error: result.error },
    }));
  }, []);

  useEffect(() => {
    if (tabs[activeTab].goals === null && !tabs[activeTab].loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on tab change, same established pattern as reminders-tab.tsx/day-view.tsx
      loadTab(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    listPlatformStaffUsers().then((result) => {
      if (result.ok) setStaffUsers(result.data);
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the year filter when switching period tabs, an intentional prop-driven reset
    setYearFilter("all");
  }, [activeTab]);

  // Tras cualquier cambio, se invalida la caché de las 4 pestañas: editar un
  // objetivo no cambia su tipo de periodo en esta entrega, pero es más
  // simple y seguro que refrescar solo la pestaña activa pueda dejar datos
  // obsoletos en el resto si en el futuro sí se permite.
  function invalidateAndRefresh() {
    setTabs({
      annual: { ...EMPTY_TAB_STATE },
      quarterly: { ...EMPTY_TAB_STATE },
      monthly: { ...EMPTY_TAB_STATE },
      weekly: { ...EMPTY_TAB_STATE },
    });
    loadTab(activeTab);
  }

  function handleCreate() {
    setEditingGoal(null);
    setFormOpen(true);
  }

  function handleEdit(goal: AgencyGoalWithOwner) {
    setEditingGoal(goal);
    setFormOpen(true);
  }

  async function handleStatusChange(goalId: string, status: GoalStatus) {
    const result = await updateGoal(goalId, { status });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    invalidateAndRefresh();
  }

  async function handleDelete(goalId: string) {
    setDeletingId(goalId);
    const result = await deleteGoal(goalId);
    setDeletingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Objetivo eliminado");
    invalidateAndRefresh();
  }

  const currentState = tabs[activeTab];

  const availableYears = useMemo(() => {
    if (!currentState.goals) return [];
    const years = new Set(currentState.goals.map((g) => parseIsoDate(g.period_start).getFullYear()));
    return [...years].sort((a, b) => b - a);
  }, [currentState.goals]);

  const visibleGoals = useMemo(() => {
    if (!currentState.goals) return [];
    if (!YEAR_FILTERABLE.includes(activeTab) || yearFilter === "all") return currentState.goals;
    const year = Number(yearFilter);
    return currentState.goals.filter((g) => parseIsoDate(g.period_start).getFullYear() === year);
  }, [currentState.goals, activeTab, yearFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Dirección · Objetivos"
        title="Objetivos"
        description="Objetivos internos de la agencia por periodo."
        actions={
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo objetivo
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as GoalPeriodType)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {GOAL_PERIOD_TYPES.map((type) => (
              <TabsTrigger key={type} value={type}>
                {GOAL_PERIOD_TYPE_LABELS[type]}
              </TabsTrigger>
            ))}
          </TabsList>

          {YEAR_FILTERABLE.includes(activeTab) && availableYears.length > 0 && (
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="h-9 w-[9.5rem]" aria-label="Filtrar por año">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los años</SelectItem>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {GOAL_PERIOD_TYPES.map((type) => (
          <TabsContent key={type} value={type} className="surface-card overflow-hidden">
            {type === activeTab && (
              <ObjetivosTable
                goals={visibleGoals}
                loading={currentState.loading}
                error={currentState.error}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                deletingId={deletingId}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      <GoalFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        periodType={activeTab}
        goal={editingGoal}
        staffUsers={staffUsers}
        onSaved={invalidateAndRefresh}
      />
    </div>
  );
}
