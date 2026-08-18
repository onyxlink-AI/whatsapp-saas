import Link from "next/link";
import { Target, BarChart3, Workflow, TrendingUp, UserPlus, CalendarClock, ArrowRight, Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface DireccionCard {
  title: string;
  description: string;
  icon: typeof Target;
  href?: string;
}

// TAREA 2/3: Objetivos y KPI ya están construidos — el resto son tarjetas
// "Próximamente" deliberadamente SIN href, para que no puedan navegar a una
// ruta inexistente ni a una página vacía (fuera de alcance explícito de
// esta entrega).
const CARDS: DireccionCard[] = [
  {
    title: "Objetivos",
    description: "Objetivos anuales, trimestrales, mensuales y semanales de la agencia.",
    icon: Target,
    href: "/direccion/objetivos",
  },
  {
    title: "KPI",
    description: "Clientes, retención, ticket medio y cierre de reuniones.",
    icon: BarChart3,
    href: "/direccion/kpi",
  },
  { title: "Operaciones", description: "Procesos internos y seguimiento operativo.", icon: Workflow },
  { title: "Comercial", description: "Pipeline y resultados comerciales de la agencia.", icon: TrendingUp },
  { title: "Onboarding de clientes", description: "Puesta en marcha de nuevos clientes.", icon: UserPlus },
  { title: "Reuniones", description: "Actas y seguimiento de reuniones internas.", icon: CalendarClock },
];

export default function DireccionPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <PageHeader
        eyebrow="Zona interna"
        title="Dirección"
        description="Panel interno de OnyxLink — solo personal de la agencia."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const content = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                {!card.href && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Próximamente
                  </span>
                )}
              </div>
              <div className="mt-3">
                <p className="font-display text-sm font-semibold text-foreground">{card.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.description}</p>
              </div>
              {card.href && (
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                  Abrir
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              )}
            </>
          );

          if (card.href) {
            return (
              <Link
                key={card.title}
                href={card.href}
                className="surface-card flex flex-col p-5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {content}
              </Link>
            );
          }

          return (
            <div
              key={card.title}
              aria-disabled="true"
              className={cn("surface-card flex flex-col p-5 opacity-70")}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
