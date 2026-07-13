import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/features/auth/services/actions";
import {
  getActiveWorkspace,
  listMemberships,
} from "@/features/workspace/services/active-workspace";
import { WorkspaceSwitcher } from "@/features/workspace/components/workspace-switcher";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Building2,
  FolderKanban,
  Kanban,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Phone,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Super admin flag + active workspace context + membership list (for switcher)
  const [{ data: userRow }, active, memberships] = await Promise.all([
    supabase
      .from("users")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
    getActiveWorkspace(supabase, user.id),
    listMemberships(supabase, user.id),
  ]);

  const isSuperAdmin = userRow?.is_super_admin ?? false;
  const activeId = active?.workspace_id ?? null;
  const workspaceName =
    memberships.find((m) => m.workspace_id === activeId)?.name ?? null;

  const activeWorkspaceRow = activeId
    ? (
        await supabase
          .from("workspaces")
          .select("vapi_assistant_id, whatsapp_agent_enabled, gestion_enabled")
          .eq("id", activeId)
          .maybeSingle()
      ).data
    : null;

  const hasVoiceAgent = Boolean(activeWorkspaceRow?.vapi_assistant_id);
  // Two independent products — Onyxlink Gestión is never bundled with the
  // WhatsApp agent. Both default to their DB defaults when the row is missing.
  const hasWhatsappAgent = activeWorkspaceRow?.whatsapp_agent_enabled !== false;
  const hasGestion = activeWorkspaceRow?.gestion_enabled === true;

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className={cn(
          "glass-strong sticky top-0 z-50 h-14 shrink-0",
          "flex items-center justify-between px-3 sm:px-6",
          "border-b border-border/50",
        )}
      >
        {/* Left: brand + workspace name */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-base font-semibold text-primary tracking-tight shrink-0">
            Agente Onyxlink
          </span>
          {workspaceName && (
            <>
              <span
                className="text-border/70 select-none shrink-0"
                aria-hidden="true"
              >
                /
              </span>
              {memberships.length > 1 && activeId ? (
                <WorkspaceSwitcher
                  workspaces={memberships.map((m) => ({
                    workspace_id: m.workspace_id,
                    name: m.name,
                  }))}
                  activeId={activeId}
                />
              ) : workspaceName.toLowerCase() === "onyxlink" ? (
                <Image
                  src="/brand/onyxlink-logo.png"
                  alt="Onyxlink"
                  width={90}
                  height={20}
                  className="h-4 w-auto shrink-0"
                  priority
                />
              ) : (
                <span
                  className="font-mono text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[200px]"
                  title={workspaceName}
                >
                  {workspaceName}
                </span>
              )}
            </>
          )}
        </div>

        {/* Right: agency link (super admin only) + dashboard + settings + logout.
            Below md, everything except logout duplicates the bottom mobile
            nav, so it's hidden there — only brand + logout stay in the header. */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="hidden md:flex items-center gap-1">
            <ThemeToggle />

            {isSuperAdmin && (
              <Link href="/workspaces">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-2">Agency</span>
                </Button>
              </Link>
            )}

            {hasWhatsappAgent && (
              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-2">Dashboard</span>
                </Button>
              </Link>
            )}

            {hasWhatsappAgent && (
              <Link href="/inbox">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-2">Agentes</span>
                </Button>
              </Link>
            )}

            {hasGestion && (
              <Link href="/clientes">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-2">Clientes</span>
                </Button>
              </Link>
            )}

            {(hasWhatsappAgent || hasGestion) && (
              <Link href="/pipeline">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Kanban className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-2">Pipeline</span>
                </Button>
              </Link>
            )}

            {hasGestion && (
              <Link href="/proyectos">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <FolderKanban className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-2">Proyectos</span>
                </Button>
              </Link>
            )}

            {hasWhatsappAgent && hasVoiceAgent && (
              <Link href="/asistente-ai">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-2">Asistente AI</span>
                </Button>
              </Link>
            )}

            <Link href="/settings">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-2">Settings</span>
              </Button>
            </Link>
          </div>

          <form action={logout}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only sm:ml-2">Salir</span>
            </Button>
          </form>
        </div>
      </header>

      <div className="flex-1 pb-14 md:pb-0">{children}</div>

      {/* Mobile bottom nav — hidden on md+ */}
      <nav
        className={cn(
          "md:hidden fixed bottom-0 inset-x-0 z-50 h-14",
          "glass-strong border-t border-border/50",
          "flex items-center justify-around px-4",
        )}
        aria-label="Navegación móvil"
      >
        {hasWhatsappAgent && (
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
            <span>Dashboard</span>
          </Link>
        )}

        {hasWhatsappAgent && (
          <Link
            href="/inbox"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            <span>Agentes</span>
          </Link>
        )}

        {hasGestion && (
          <Link
            href="/clientes"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Users className="h-5 w-5" aria-hidden="true" />
            <span>Clientes</span>
          </Link>
        )}

        {(hasWhatsappAgent || hasGestion) && (
          <Link
            href="/pipeline"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Kanban className="h-5 w-5" aria-hidden="true" />
            <span>Pipeline</span>
          </Link>
        )}

        {hasGestion && (
          <Link
            href="/proyectos"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <FolderKanban className="h-5 w-5" aria-hidden="true" />
            <span>Proyectos</span>
          </Link>
        )}

        {hasWhatsappAgent && hasVoiceAgent && (
          <Link
            href="/asistente-ai"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Phone className="h-5 w-5" aria-hidden="true" />
            <span>Asistente AI</span>
          </Link>
        )}

        <Link
          href="/settings"
          className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
          <span>Settings</span>
        </Link>

        {isSuperAdmin && (
          <Link
            href="/workspaces"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Building2 className="h-5 w-5" aria-hidden="true" />
            <span>Agency</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
