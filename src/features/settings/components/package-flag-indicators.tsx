import { LayoutGrid, MessageCircle, Network, PenTool } from "lucide-react";
import { cn } from "@/lib/utils";

// Revisión correctiva de Fase 2: Gestión, WhatsApp, Oficina Virtual y Board
// ya no son interruptores — son 100% derivados de product_package
// (set_workspace_product_package() es la única escritura posible). Esto es
// solo un espejo de solo lectura de esos 4 flags; cambiar el paquete arriba
// (ProductPackageCards) es la única forma de modificarlos.
interface FlagRow {
  icon: typeof LayoutGrid;
  label: string;
  description: string;
  enabled: boolean;
}

interface Props {
  gestionEnabled: boolean;
  whatsappAgentEnabled: boolean;
  officeVirtualEnabled: boolean;
  whiteboardEnabled: boolean;
}

export function PackageFlagIndicators({
  gestionEnabled,
  whatsappAgentEnabled,
  officeVirtualEnabled,
  whiteboardEnabled,
}: Props) {
  const rows: FlagRow[] = [
    {
      icon: LayoutGrid,
      label: "Onyxlink Gestión",
      description: "Clientes, Proyectos, Agenda, Anotaciones y Contenido.",
      enabled: gestionEnabled,
    },
    {
      icon: MessageCircle,
      label: "Agente de WhatsApp",
      description: "Conversaciones y agente automatizado.",
      enabled: whatsappAgentEnabled,
    },
    {
      icon: Network,
      label: "Oficina Virtual",
      description: "Equipo de especialistas y su orquestador.",
      enabled: officeVirtualEnabled,
    },
    {
      icon: PenTool,
      label: "Board",
      description: "Tableros de dibujo libre dentro de Proyectos.",
      enabled: whiteboardEnabled,
    },
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4"
        >
          <div className="flex gap-3">
            <row.icon
              className="h-5 w-5 mt-0.5 shrink-0 text-[hsl(var(--electric-lime))]"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-md">{row.description}</p>
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
              row.enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {row.enabled ? "Incluido" : "No incluido"}
          </span>
        </div>
      ))}
    </div>
  );
}
