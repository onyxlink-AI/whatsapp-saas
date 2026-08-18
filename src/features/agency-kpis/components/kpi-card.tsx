import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  icon: LucideIcon;
  /** Valor ya formateado ("Sin datos suficientes" incluido) — nunca un número inventado. */
  value: string;
  /** Ayuda discreta bajo el valor (media exacta en días, nº de clientes con cuota, etc.). */
  helpText?: string;
}

export function KpiCard({ label, icon: Icon, value, helpText }: KpiCardProps) {
  return (
    <div className="surface-card flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-[0.08em]">{label}</span>
      </div>
      <p className="font-display text-2xl font-semibold text-foreground">{value}</p>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
