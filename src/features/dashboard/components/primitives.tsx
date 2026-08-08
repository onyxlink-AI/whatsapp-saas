"use client";

// Fase 2 (§4.1 — "crear un modelo común de dashboard... y bloques
// independientes"): KpiCard/PriorityRow/QuickAction vivían solo dentro de
// dashboard-metrics.tsx (el bloque WhatsApp). Se extraen aquí, sin ningún
// cambio de comportamiento, para que el bloque Gestión los reutilice tal
// cual en vez de reinventar el mismo lenguaje visual.

import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motionClasses } from "@/features/ui-kit/motion";

interface KpiCardProps {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "neutral" | "primary" | "warning";
  index?: number;
}

export function KpiCard({ label, value, helper, icon: Icon, tone = "neutral", index = 0 }: KpiCardProps) {
  return (
    <div
      className={cn(
        "surface-card min-h-36 p-5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md",
        motionClasses.fadeInUp,
        tone === "primary" && "border-primary/20 bg-gradient-to-br from-primary/[0.1] via-card to-card",
        tone === "warning" && "border-warning/25 bg-gradient-to-br from-warning/[0.12] via-card to-card",
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-[12rem] text-xs font-medium leading-5 text-muted-foreground">{label}</p>
        <div
          className={cn(
            "shrink-0 rounded-lg p-2",
            tone === "primary" && "bg-primary text-primary-foreground",
            tone === "warning" && "bg-warning/15 text-warning",
            tone === "neutral" && "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-5 font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{helper}</p>
    </div>
  );
}

interface PriorityRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "success" | "primary" | "warning" | "muted";
  href?: string;
}

export function PriorityRow({ icon: Icon, title, description, tone = "muted", href }: PriorityRowProps) {
  const content = (
    <>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          tone === "success" && "bg-success/10 text-success",
          tone === "primary" && "bg-primary/10 text-primary",
          tone === "warning" && "bg-warning/10 text-warning",
          tone === "muted" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {href && (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden="true"
        />
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </Link>
    );
  }

  return <div className="flex items-center gap-3 px-3 py-3">{content}</div>;
}

interface QuickActionProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export function QuickAction({ href, icon: Icon, title, description }: QuickActionProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-20 items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
