"use client";

import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { MessageVolumePoint } from "@/features/dashboard/services/metrics";

const COLOR_OUTBOUND = "oklch(var(--chart-1))";
const COLOR_INBOUND = "oklch(var(--chart-messages-in))";

function formatDayLabel(dateStr: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${dateStr}T00:00:00`));
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-foreground mb-1">
        {formatDayLabel(label ?? "")}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: <span className="text-foreground font-medium tabular-nums">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export function MessageVolumeChart({ data }: { data: MessageVolumePoint[] }) {
  const hasActivity = data.some((d) => d.inbound > 0 || d.outbound > 0);

  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-foreground">
          💬 Mensajes por día (últimos {data.length} días)
        </h2>
      </div>

      {!hasActivity ? (
        <div className="h-56 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Todavía no hay mensajes en estos días</p>
        </div>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid
                vertical={false}
                stroke="hsl(var(--border))"
                strokeOpacity={0.5}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDayLabel}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
              <Legend
                verticalAlign="top"
                height={28}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
              />
              <Line
                type="monotone"
                dataKey="outbound"
                name="Salientes"
                stroke={COLOR_OUTBOUND}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="inbound"
                name="Entrantes"
                stroke={COLOR_INBOUND}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
