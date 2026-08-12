"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Boxes, FolderKanban, MessageCircle, MessageSquare, Building2, Briefcase, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PACKAGE_MATRIX, PACKAGE_LABELS, lostCapabilities, type ProductPackage } from "@/features/entitlements/resolve";

// Fase 2 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §2.6):
// una tarjeta por paquete, un solo botón "Activar paquete", mismo patrón de
// saving/toast que team-chat-toggle.tsx. La mutación es atómica en el
// servidor (set_workspace_product_package) — aquí solo se pide confirmación
// visual antes de perder algo, el cálculo de qué se pierde es puro
// (lostCapabilities), sin ida y vuelta al servidor.
const PACKAGE_ORDER: ProductPackage[] = ["none", "gestion", "whatsapp_gestion", "whatsapp", "oficina", "whatsapp_oficina", "suite"];

const PACKAGE_ICON: Record<ProductPackage, typeof Boxes> = {
  none: Boxes,
  gestion: FolderKanban,
  whatsapp_gestion: MessageCircle,
  whatsapp: MessageSquare,
  oficina: Building2,
  whatsapp_oficina: Briefcase,
  suite: Network,
};

const PACKAGE_DESCRIPTIONS: Record<ProductPackage, string> = {
  none: "Sin ningún producto activo todavía.",
  gestion: "Clientes, Proyectos, Agenda, Anotaciones, Board y Contenido.",
  whatsapp_gestion: "Todo Gestión, más el Agente de WhatsApp y Conversaciones.",
  whatsapp: "Solo el Agente de WhatsApp y Conversaciones, sin Gestión ni Oficina.",
  oficina: "Solo Oficina Virtual, sin Gestión ni Agente de WhatsApp.",
  whatsapp_oficina: "Agente de WhatsApp y Oficina Virtual, sin Gestión.",
  suite: "Todo WhatsApp + Gestión, más Oficina Virtual.",
};

function packageIncludes(pkg: ProductPackage): string[] {
  const caps = PACKAGE_MATRIX[pkg];
  const items: string[] = [];
  // Board va siempre junto a Gestión (hasWhiteboard === hasGestion) — una
  // sola línea, no dos.
  if (caps.hasGestion) items.push("Clientes, Proyectos, Agenda, Anotaciones, Contenido y Board");
  if (caps.hasWhatsappAgent) items.push("Agente de WhatsApp y Conversaciones");
  if (caps.hasOfficeVirtual) items.push("Oficina Virtual");
  if (items.length === 0) items.push("Ningún producto");
  return items;
}

interface Props {
  workspaceId: string;
  initialPackage: ProductPackage;
}

export function ProductPackageCards({ workspaceId, initialPackage }: Props) {
  const [current, setCurrent] = useState<ProductPackage>(initialPackage);
  const [saving, setSaving] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<ProductPackage | null>(null);

  async function applyPackage(target: ProductPackage) {
    setSaving(true);
    try {
      const response = await fetch(`/api/workspace/${workspaceId}/product-package`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: target }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof data.error === "string" ? data.error : "Error al guardar");
      }
      setCurrent(target);
      toast.success(`Paquete activado: ${PACKAGE_LABELS[target]}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setSaving(false);
      setPendingTarget(null);
    }
  }

  function handleActivate(target: ProductPackage) {
    if (target === current || saving) return;
    // Pide confirmación siempre que el cambio pierda alguna capacidad —
    // por capacidades (lostCapabilities), no por un peso lineal: con
    // whatsapp_oficina un cambio puede GANAR WhatsApp/Oficina y PERDER
    // Gestión al mismo tiempo, algo que un simple "más alto/más bajo" no
    // puede representar. Nunca se ejecuta el cambio sin que el superadmin
    // vea primero qué se pierde.
    if (lostCapabilities(current, target).length > 0) {
      setPendingTarget(target);
      return;
    }
    void applyPackage(target);
  }

  const lost = pendingTarget ? lostCapabilities(current, pendingTarget) : [];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {PACKAGE_ORDER.map((pkg) => {
          const Icon = PACKAGE_ICON[pkg];
          const isCurrent = pkg === current;
          return (
            <div
              key={pkg}
              className={cn(
                "flex flex-col gap-3 rounded-lg border p-4",
                isCurrent ? "border-primary/50 bg-primary/[0.04]" : "border-border/60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex gap-2.5">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{PACKAGE_LABELS[pkg]}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{PACKAGE_DESCRIPTIONS[pkg]}</p>
                  </div>
                </div>
                {isCurrent && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
              </div>
              <ul className="flex flex-col gap-1 pl-6 text-[11px] text-muted-foreground">
                {packageIncludes(pkg).map((item) => (
                  <li key={item} className="list-disc">
                    {item}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant={isCurrent ? "outline" : "default"}
                className="h-8 text-xs"
                disabled={isCurrent || saving}
                onClick={() => handleActivate(pkg)}
              >
                {isCurrent ? "Paquete actual" : "Activar paquete"}
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={pendingTarget !== null} onOpenChange={(open) => !open && setPendingTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar a {pendingTarget ? PACKAGE_LABELS[pendingTarget] : ""}</DialogTitle>
            <DialogDescription>
              Este cambio no borra ningún dato — solo deja de mostrarse hasta que se reactive. El cliente perderá acceso a:
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1 pl-5 text-sm text-foreground">
            {lost.map((item) => (
              <li key={item} className="list-disc">
                {item}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingTarget(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => pendingTarget && applyPackage(pendingTarget)} disabled={saving}>
              Confirmar cambio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
