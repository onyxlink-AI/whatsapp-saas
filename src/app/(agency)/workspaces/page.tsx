import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspace,
  getDefaultRouteForWorkspace,
} from "@/features/workspace/services/active-workspace";
import { getAllWorkspacesWithStats } from "@/features/agency/services/agency-actions";
import { WorkspacesTable } from "@/features/agency/components/workspaces-table";
import { formatTokens, ESTIMATED_USD_PER_MILLION_TOKENS } from "@/features/agency/lib/cost-format";
import { Building2, Users, MessageCircle, Wifi, Zap, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AgencyWorkspacesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  if (!userRow?.is_super_admin) {
    const membership = await getActiveWorkspace(supabase, user.id);
    redirect(
      membership
        ? await getDefaultRouteForWorkspace(supabase, membership.workspace_id)
        : "/onboarding",
    );
  }

  const result = await getAllWorkspacesWithStats();

  const workspaces = result.error ? [] : (result.workspaces ?? []);

  // Aggregate stats for KPI cards
  const totalMembers = workspaces.reduce((sum, w) => sum + w.member_count, 0);
  const totalConversations = workspaces.reduce(
    (sum, w) => sum + w.conversation_count,
    0,
  );
  const connectedCount = workspaces.filter((w) => w.ycloud_connected).length;
  const totalTokensToday = workspaces.reduce((sum, w) => sum + w.tokens_today, 0);
  const totalTokens30d = workspaces.reduce((sum, w) => sum + w.tokens_30d, 0);
  const estimatedCost30d = (totalTokens30d / 1_000_000) * ESTIMATED_USD_PER_MILLION_TOKENS;

  const kpis: {
    label: string;
    value: string;
    icon: typeof Building2;
    caption?: string;
    accent?: boolean;
  }[] = [
    {
      label: "Workspaces",
      value: String(workspaces.length),
      icon: Building2,
      accent: true,
    },
    {
      label: "Miembros totales",
      value: String(totalMembers),
      icon: Users,
    },
    {
      label: "Conversaciones",
      value: String(totalConversations),
      icon: MessageCircle,
    },
    {
      label: "YCloud conectado",
      value: String(connectedCount),
      icon: Wifi,
    },
    {
      label: "Tokens IA — hoy",
      value: formatTokens(totalTokensToday),
      icon: Zap,
      caption: "Todos los workspaces, suma del día",
    },
    {
      label: "Costo estimado (30 días)",
      value: `$${estimatedCost30d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      caption: `Estimado a ~$${ESTIMATED_USD_PER_MILLION_TOKENS}/millón de tokens, no es la factura real`,
      accent: true,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Brand banner */}
      <Image
        src="/brand/onyxlink-banner.jpg"
        alt="Onyxlink"
        width={580}
        height={580}
        className="w-full max-w-lg mx-auto rounded-2xl object-cover glass"
        priority
      />

      {/* Page header */}
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">
          Workspaces
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gestiona todos los workspaces de clientes desde aquí.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(({ label, value, icon: Icon, caption, accent }) => (
          <div
            key={label}
            className={cn(
              "rounded-xl p-4 space-y-2",
              accent ? "glass-accent" : "border border-border bg-card",
            )}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="font-mono text-2xl font-bold text-foreground">
              {value}
            </p>
            {caption && (
              <p className="text-[0.7rem] leading-snug text-muted-foreground">
                {caption}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {result.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            Error al cargar workspaces: {result.error}
          </p>
        </div>
      )}

      {/* Table */}
      <WorkspacesTable
        workspaces={workspaces}
        googleServiceAccountEmail={process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}
      />
    </div>
  );
}
