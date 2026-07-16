"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import type { ConversationStateCount } from "@/features/dashboard/services/metrics";
import type { ConversationState } from "@/features/inbox/types";

const STATE_LABELS: Record<ConversationState, string> = {
  ai_active: "IA activa",
  human_active: "Humano",
  handoff_pending: "Handoff",
  waiting_reply: "Esperando",
  paused: "Pausado",
  closed: "Cerrado",
};

// Single hue: axis position + label already carry category identity, so every
// bar shares the same accent — no categorical palette needed here.
const BAR_COLOR = "oklch(var(--chart-1))";

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ConversationStateCount }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;

  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 shadow-md text-xs">
      <p className="text-foreground">
        {STATE_LABELS[row.state]}:{" "}
        <span className="font-medium tabular-nums">{row.count}</span>
      </p>
    </div>
  );
}

export function ConversationStateChart({ data }: { data: ConversationStateCount[] }) {
  const chartData = [...data].sort((a, b) => b.count - a.count);

  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <h2 className="font-display text-sm font-semibold text-foreground mb-4">
        Conversaciones por estado
      </h2>

      {chartData.length === 0 ? (
        <div className="h-40 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Sin conversaciones</p>
        </div>
      ) : (
        <div style={{ height: Math.max(chartData.length * 40, 120) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
              barCategoryGap={10}
            >
              <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="state"
                tickFormatter={(s: ConversationState) => STATE_LABELS[s]}
                tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                axisLine={false}
                tickLine={false}
                width={90}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                {chartData.map((row) => (
                  <Cell key={row.state} fill={BAR_COLOR} />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  style={{ fill: "hsl(var(--foreground))", fontSize: 12, fontWeight: 500 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
