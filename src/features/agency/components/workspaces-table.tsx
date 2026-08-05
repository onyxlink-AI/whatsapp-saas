"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  ExternalLink,
  Settings,
  Trash2,
  AlertTriangle,
  MessageCircle,
  MessagesSquare,
  Users,
  Phone,
  Network,
  Bot,
  PenTool,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateWorkspaceSheet } from "./create-workspace-sheet";
import { switchWorkspace } from "@/features/workspace/services/actions";
import { deleteWorkspaceForClient } from "../services/agency-actions";
import { formatTokens } from "../lib/cost-format";
import { cn } from "@/lib/utils";
import type { WorkspaceWithStats } from "../types";

interface Props {
  workspaces: WorkspaceWithStats[];
  googleServiceAccountEmail?: string;
}

// Fase 1 del roadmap comercial: el paquete efectivo, en un solo lugar —
// nunca deducido de nuevo aquí, siempre el valor ya calculado en
// agency-actions.ts a partir de gestion/whatsapp/officeVirtual.
const PACKAGE_TIER_META: Record<
  WorkspaceWithStats["package_tier"],
  { label: string; className: string }
> = {
  none: { label: "Sin paquete", className: "border-border bg-muted/40 text-muted-foreground" },
  gestion: { label: "Paquete 1 · Gestión", className: "border-primary/25 bg-primary/[0.08] text-primary" },
  whatsapp: { label: "Paquete 2 · Gestión + WhatsApp", className: "border-primary/30 bg-primary/[0.12] text-primary" },
  suite: { label: "Paquete 3 · Suite completa", className: "border-[hsl(var(--electric-lime))]/40 bg-[hsl(var(--electric-lime))]/10 text-foreground" },
  inconsistent: { label: "⚠ WhatsApp sin Gestión", className: "border-warning/40 bg-warning/10 text-warning" },
};

function PackageTierBadge({ tier }: { tier: WorkspaceWithStats["package_tier"] }) {
  const meta = PACKAGE_TIER_META[tier];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

const PRODUCT_META = [
  { key: "whatsappAgent", label: "Agente de WhatsApp", Icon: MessageCircle } as const,
  { key: "gestion", label: "Onyxlink Gestión", Icon: Users } as const,
  { key: "voice", label: "Asistente de Voz", Icon: Phone } as const,
  { key: "officeVirtual", label: "Oficina Virtual", Icon: Network } as const,
  { key: "chatbot", label: "Chatbot", Icon: Bot } as const,
  { key: "whiteboard", label: "Board", Icon: PenTool } as const,
  { key: "teamChat", label: "Chat de equipo", Icon: MessagesSquare } as const,
];

/** Compact "what's contracted" row — same product flags every other surface reads, never a separate computation. */
function ProductBadges({
  products,
  teamChatSeats,
}: {
  products: WorkspaceWithStats["products"];
  teamChatSeats: WorkspaceWithStats["teamChatSeats"];
}) {
  const activeProducts = PRODUCT_META.filter(({ key }) => products[key]);
  const seatsFull = products.teamChat && teamChatSeats.used >= teamChatSeats.limit;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {activeProducts.length === 0 && (
        <span className="text-[11px] text-muted-foreground">Sin productos activos</span>
      )}
      {activeProducts.map(({ key, label, Icon }) => (
        <span
          key={key}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
            key === "teamChat" && seatsFull
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-primary/20 bg-primary/[0.07] text-foreground",
          )}
        >
          <Icon className="h-3 w-3 text-primary" aria-hidden="true" />
          {key === "teamChat" ? `${label} · ${teamChatSeats.used}/${teamChatSeats.limit}` : label}
        </span>
      ))}
    </div>
  );
}

function AccountStatus({ workspace }: { workspace: WorkspaceWithStats }) {
  const activeAddons = Object.values(workspace.addons).filter(Boolean).length;
  const ready = workspace.readiness_issues.length === 0;
  return (
    <div className="space-y-1.5">
      <Badge
        variant="outline"
        className={cn(
          "w-fit gap-1",
          ready
            ? "border-success/30 bg-success/10 text-success"
            : "border-warning/30 bg-warning/10 text-warning",
        )}
      >
        {ready ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        {ready ? "Preparado" : `${workspace.readiness_issues.length} pendiente${workspace.readiness_issues.length > 1 ? "s" : ""}`}
      </Badge>
      {workspace.readiness_issues.map((issue) => (
        <p key={issue} className="max-w-40 text-[10px] leading-tight text-muted-foreground">{issue}</p>
      ))}
      {activeAddons > 0 && (
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" /> {activeAddons} mejora{activeAddons > 1 ? "s" : ""} IA
        </p>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));
}

export function WorkspacesTable({
  workspaces,
  googleServiceAccountEmail,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const filtered = workspaces.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.slug.toLowerCase().includes(search.toLowerCase()),
  );

  function handleCreated() {
    startRefresh(() => {
      router.refresh();
    });
  }

  // Set the active-workspace context, then navigate into the app for it.
  // The action only sets the cookie (no redirectTo); we navigate client-side —
  // mirroring WorkspaceSwitcher. A redirect() inside startTransition does not
  // navigate reliably on Next 16 / React 19, which left this button mute.
  function handleEnter(workspaceId: string, to: string) {
    startRefresh(async () => {
      const result = await switchWorkspace(workspaceId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.push(to);
    });
  }

  // Permanently delete a client (cascade). Two-step confirm via `confirmId`.
  function handleDelete(workspaceId: string) {
    setConfirmId(null);
    startRefresh(async () => {
      const result = await deleteWorkspaceForClient(workspaceId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Cliente eliminado");
      router.refresh();
    });
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <Input
          placeholder="Buscar empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          aria-label="Buscar empresa por nombre"
        />
        <Button
          size="sm"
          onClick={() => setSheetOpen(true)}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Nuevo cliente
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Header row */}
        <div
          className={cn(
            "hidden md:grid gap-4 px-4 py-2.5",
            "border-b border-border bg-muted/40",
            "grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]",
          )}
        >
          {[
            "Empresa",
            "Miembros",
            "Conversaciones",
            "Estado",
            "Tokens IA (30d)",
            "Creado",
            "",
          ].map((h) => (
            <p
              key={h}
              className="font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {h}
            </p>
          ))}
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Building2 className="h-8 w-8 opacity-40" strokeWidth={1.5} />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {search ? "Sin resultados" : "Sin empresas aún"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {search
                  ? "Prueba con otro término de búsqueda"
                  : "Da de alta tu primer cliente"}
              </p>
            </div>
            {!search && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSheetOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Dar de alta cliente
              </Button>
            )}
          </div>
        )}

        {/* Rows */}
        {filtered.map((workspace) => (
          <div
            key={workspace.id}
            className={cn(
              "flex flex-col gap-3 px-4 py-4",
              "md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] md:items-center md:gap-4 md:py-3",
              "border-b border-border last:border-0",
              "hover:bg-muted/20 transition-colors duration-150",
            )}
          >
            {/* Workspace name + slug */}
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-foreground truncate">
                {workspace.name}
              </p>
              <p className="font-mono text-xs text-muted-foreground mt-0.5">
                {workspace.slug}
              </p>
              <div className="mt-1.5">
                <PackageTierBadge tier={workspace.package_tier} />
              </div>
              <ProductBadges products={workspace.products} teamChatSeats={workspace.teamChatSeats} />
            </div>

            {/* Miembros */}
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground md:hidden">
                Miembros:
              </span>
              <p className="font-mono text-sm font-bold text-foreground">
                {workspace.member_count}
              </p>
            </div>

            {/* Conversaciones */}
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground md:hidden">
                Conversaciones:
              </span>
              <p className="font-mono text-sm text-foreground">
                {workspace.conversation_count}
              </p>
            </div>

            {/* Commercial/configuration readiness */}
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground md:hidden">
                Estado:
              </span>
              <AccountStatus workspace={workspace} />
            </div>

            {/* Tokens IA (30d) */}
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground md:hidden">
                Tokens IA (30d):
              </span>
              <div className="flex items-center gap-1.5">
                <p className="font-mono text-sm text-foreground">
                  {formatTokens(workspace.tokens_30d)}
                </p>
                {workspace.has_recent_cost_alert && (
                  <span title="Esta empresa cruzó el umbral de alerta de costo en los últimos 30 días">
                    <AlertTriangle
                      className="h-3.5 w-3.5 text-warning"
                      aria-label="Alerta de costo reciente"
                    />
                  </span>
                )}
              </div>
            </div>

            {/* Fecha */}
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground md:hidden">
                Creado:
              </span>
              <p className="font-mono text-xs text-muted-foreground">
                {formatDate(workspace.created_at)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
                aria-label={`Ir al inbox de ${workspace.name}`}
                onClick={() => handleEnter(workspace.id, "/inbox")}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-1.5 text-xs">
                  Inbox
                </span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
                aria-label={`Gestionar ${workspace.name}`}
                onClick={() => handleEnter(workspace.id, "/settings")}
              >
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-1.5 text-xs">
                  Gestionar
                </span>
              </Button>

              {confirmId === workspace.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 px-2.5 text-xs"
                    aria-label={`Confirmar eliminación de ${workspace.name}`}
                    onClick={() => handleDelete(workspace.id)}
                  >
                    Eliminar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2.5 text-xs text-muted-foreground"
                    onClick={() => setConfirmId(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-muted-foreground hover:text-destructive"
                  aria-label={`Eliminar ${workspace.name}`}
                  onClick={() => setConfirmId(workspace.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Refreshing overlay indicator */}
      {refreshing && (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      <CreateWorkspaceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={handleCreated}
        googleServiceAccountEmail={googleServiceAccountEmail}
      />
    </>
  );
}
