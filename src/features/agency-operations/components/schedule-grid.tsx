"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatHourRangeWords, formatHourStart } from "../services/schedule-format";
import { SCHEDULE_COLOR_STYLES } from "./schedule-colors";
import { SCHEDULE_HOURS, SCHEDULE_WEEKDAYS, SCHEDULE_WEEKDAY_LABELS, type AgencyScheduleBlockWithResponsible, type ScheduleWeekday } from "../types";

interface Props {
  blocks: AgencyScheduleBlockWithResponsible[];
  onCreate: (weekday: ScheduleWeekday, hour: number) => void;
  onEdit: (block: AgencyScheduleBlockWithResponsible) => void;
}

function cellKey(weekday: number, hour: number): string {
  return `${weekday}-${hour}`;
}

function EmptyCell({ weekday, hour, onCreate }: { weekday: ScheduleWeekday; hour: number; onCreate: (weekday: ScheduleWeekday, hour: number) => void }) {
  const weekdayLabel = SCHEDULE_WEEKDAY_LABELS[weekday].toLowerCase();
  return (
    <button
      type="button"
      onClick={() => onCreate(weekday, hour)}
      aria-label={`Añadir bloque el ${weekdayLabel} de ${formatHourRangeWords(hour)}`}
      className="group flex h-12 w-full items-center justify-center rounded-md text-muted-foreground/0 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <Plus className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
    </button>
  );
}

function OccupiedCell({
  block,
  onEdit,
}: {
  block: AgencyScheduleBlockWithResponsible;
  onEdit: (block: AgencyScheduleBlockWithResponsible) => void;
}) {
  const weekdayLabel = SCHEDULE_WEEKDAY_LABELS[block.weekday].toLowerCase();
  const responsibleName = block.responsible?.full_name;
  const style = SCHEDULE_COLOR_STYLES[block.color_key];
  const ariaLabel = `Editar bloque el ${weekdayLabel} de ${formatHourRangeWords(block.hour)}: ${block.content}${
    responsibleName ? ` (${responsibleName})` : ""
  }`;

  return (
    <button
      type="button"
      onClick={() => onEdit(block)}
      aria-label={ariaLabel}
      className={cn(
        "flex h-12 w-full flex-col items-start justify-center gap-0.5 overflow-hidden rounded-md border px-2 py-1 text-left transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        style.cell,
      )}
    >
      <span className="line-clamp-1 w-full text-[11px] font-medium leading-tight">{block.content}</span>
      {responsibleName && <span className="line-clamp-1 w-full text-[10px] leading-tight opacity-75">{responsibleName}</span>}
    </button>
  );
}

function DayHourList({
  weekday,
  blockByCell,
  onCreate,
  onEdit,
}: {
  weekday: ScheduleWeekday;
  blockByCell: Map<string, AgencyScheduleBlockWithResponsible>;
  onCreate: (weekday: ScheduleWeekday, hour: number) => void;
  onEdit: (block: AgencyScheduleBlockWithResponsible) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {SCHEDULE_HOURS.map((hour) => {
        const block = blockByCell.get(cellKey(weekday, hour));
        return (
          <li key={hour} className="flex items-stretch gap-3 px-2 py-1">
            <span className="flex w-14 shrink-0 items-center text-xs font-medium tabular-nums text-muted-foreground">{formatHourStart(hour)}</span>
            <div className="min-h-11 flex-1 py-0.5">
              {block ? <OccupiedCell block={block} onEdit={onEdit} /> : <EmptyCell weekday={weekday} hour={hour} onCreate={onCreate} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ScheduleGrid({ blocks, onCreate, onEdit }: Props) {
  const blockByCell = useMemo(() => {
    const map = new Map<string, AgencyScheduleBlockWithResponsible>();
    for (const block of blocks) map.set(cellKey(block.weekday, block.hour), block);
    return map;
  }, [blocks]);

  return (
    <div>
      {/* Escritorio/tablet: cuadrícula completa lunes-domingo x 00:00-23:00.
          data-testid solo para acotar consultas de test entre esta versión y
          la móvil (ambas coexisten en el DOM de jsdom, sin CSS real que
          oculte una de las dos) — las aserciones en sí comprueban roles,
          texto y aria-label, nunca esta clase/testid. */}
      <div data-testid="schedule-grid-desktop" className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-16 border-b border-r border-border bg-card px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Hora
              </th>
              {SCHEDULE_WEEKDAYS.map((weekday) => (
                <th
                  key={weekday}
                  scope="col"
                  className="min-w-[7rem] border-b border-border bg-card px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {SCHEDULE_WEEKDAY_LABELS[weekday]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCHEDULE_HOURS.map((hour) => (
              <tr key={hour}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 w-16 border-b border-r border-border bg-card px-2 py-1 text-left text-xs font-medium tabular-nums text-muted-foreground"
                >
                  {formatHourStart(hour)}
                </th>
                {SCHEDULE_WEEKDAYS.map((weekday) => {
                  const block = blockByCell.get(cellKey(weekday, hour));
                  return (
                    <td key={weekday} className="border-b border-r border-border/60 p-0.5 last:border-r-0">
                      {block ? <OccupiedCell block={block} onEdit={onEdit} /> : <EmptyCell weekday={weekday} hour={hour} onCreate={onCreate} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: un día a la vez, lista vertical de sus 24 horas. Reutiliza
          el componente Tabs (Radix) ya usado en Objetivos/KPI — implementa
          de fábrica el patrón ARIA completo de pestañas: id estable +
          aria-controls por tab, roving tabindex (seleccionada=0, resto=-1),
          panel role="tabpanel" con aria-labelledby, y navegación de teclado
          ArrowLeft/ArrowRight/Home/End con el foco siguiendo a la selección
          (@radix-ui/react-roving-focus). No hace falta reimplementar nada
          de eso a mano. */}
      <Tabs defaultValue="1" data-testid="schedule-grid-mobile" className="md:hidden">
        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <TabsList aria-label="Día de la semana" className="h-auto w-max gap-1.5 bg-transparent p-0">
            {SCHEDULE_WEEKDAYS.map((weekday) => (
              <TabsTrigger
                key={weekday}
                value={String(weekday)}
                className="min-h-11 shrink-0 rounded-lg bg-muted px-3 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
              >
                {SCHEDULE_WEEKDAY_LABELS[weekday]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {SCHEDULE_WEEKDAYS.map((weekday) => (
          <TabsContent key={weekday} value={String(weekday)} className="mt-2">
            <DayHourList weekday={weekday} blockByCell={blockByCell} onCreate={onCreate} onEdit={onEdit} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
