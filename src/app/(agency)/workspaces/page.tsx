import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspace,
  getDefaultRouteForWorkspace,
} from "@/features/workspace/services/active-workspace";
import { getAllWorkspacesWithStats } from "@/features/agency/services/agency-actions";
import { WorkspacesTable } from "@/features/agency/components/workspaces-table";
import { formatTokens, ESTIMATED_USD_PER_MILLION_TOKENS } from "@/features/agency/lib/cost-format";
import { Building2, Users, MessageCircle, Wifi, Zap, DollarSign, PackageCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

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
  const activeProducts = workspaces.reduce(
    (sum, workspace) => sum + Object.values(workspace.products).filter(Boolean).length,
    0,
  );
  const accountsRequiringAttention = workspaces.filter(
    (workspace) => workspace.readiness_issues.length > 0,
  ).length;
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
      label: "Empresas",
      value: String(workspaces.length),
      icon: Building2,
      accent: true,
    },
    {
      label: "Personas con acceso",
      value: String(totalMembers),
      icon: Users,
    },
    {
      label: "Productos activos",
      value: String(activeProducts),
      icon: PackageCheck,
      caption: "Suma de servicios contratados",
    },
    {
      label: "Requieren atención",
      value: String(accountsRequiringAttention),
      icon: TriangleAlert,
      caption: accountsRequiringAttention === 0 ? "Todas las cuentas están preparadas" : "Configuraciones pendientes",
      accent: accountsRequiringAttention > 0,
    },
    {
      label: "Conversaciones totales",
      value: String(totalConversations),
      icon: MessageCircle,
    },
    {
      label: "WhatsApp conectado",
      value: String(connectedCount),
      icon: Wifi,
    },
    {
      label: "Consumo de IA hoy",
      value: formatTokens(totalTokensToday),
      icon: Zap,
      caption: "Suma de todas las empresas",
    },
    {
      label: "Coste estimado · 30 días",
      value: `$${estimatedCost30d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      caption: `Estimación orientativa a ~$${ESTIMATED_USD_PER_MILLION_TOKENS}/millón de tokens`,
      accent: true,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        eyebrow="Administración OnyxLink"
        title="Empresas"
        description="Controla los productos activos, las conexiones y el consumo de cada cliente desde un único lugar."
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, caption, accent }) => (
          <div
            key={label}
            className={cn(
              "surface-card min-h-32 p-5",
              accent && "border-primary/20 bg-gradient-to-br from-primary/[0.12] via-card to-card",
            )}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums">
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
            No hemos podido cargar las empresas: {result.error}
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
