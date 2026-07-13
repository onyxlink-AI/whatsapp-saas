"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAgendaViewStore } from "@/features/projects/store/agenda-view-store";
import type { AgendaScheduleMode } from "@/features/projects/types";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import { GoogleCalendarPanel } from "./google-calendar-panel";

interface AgendaViewProps {
  workspaceId: string;
}

export function AgendaView({ workspaceId }: AgendaViewProps) {
  const viewMode = useAgendaViewStore((s) => s.viewMode);
  const selectedDate = useAgendaViewStore((s) => s.selectedDate);
  const setViewMode = useAgendaViewStore((s) => s.setViewMode);
  const setSelectedDate = useAgendaViewStore((s) => s.setSelectedDate);

  return (
    <div className="flex flex-col h-full gap-3">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as AgendaScheduleMode)}>
        <TabsList>
          <TabsTrigger value="day">Día</TabsTrigger>
          <TabsTrigger value="week">Semana</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex-1 overflow-y-auto">
        {viewMode === "day" ? (
          <DayView
            workspaceId={workspaceId}
            date={selectedDate}
            onDateChange={setSelectedDate}
          />
        ) : (
          <WeekView
            workspaceId={workspaceId}
            date={selectedDate}
            onDateChange={setSelectedDate}
          />
        )}
      </div>

      <GoogleCalendarPanel
        workspaceId={workspaceId}
        viewMode={viewMode}
        date={selectedDate}
      />
    </div>
  );
}
