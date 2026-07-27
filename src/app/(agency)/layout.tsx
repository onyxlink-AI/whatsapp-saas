import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspace,
  getDefaultRouteForWorkspace,
} from "@/features/workspace/services/active-workspace";
import { cn } from "@/lib/utils";
import {
  Building2,
  Kanban,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/services/actions";
import { Badge } from "@/components/ui/badge";

export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className={cn(
          "glass-strong sticky top-0 z-50 h-14 shrink-0",
          "flex items-center justify-between px-3 sm:px-6",
          "border-b border-border/50",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="font-display text-base font-semibold text-primary tracking-tight">
            Agente Onyxlink
          </span>
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 text-primary text-xs font-mono px-1.5 py-0"
          >
            Agency
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          {/* Below md this duplicates the mobile bottom nav's own Inbox
              link (and its Settings icon reads as pointing to /settings,
              not /inbox) — desktop-only, matches MainLayout's header. */}
          <div className="hidden md:flex items-center gap-1">
            <Link href="/inbox">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-2">Ir a la app</span>
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

      {/* Agency sub-nav */}
      <nav
        className="glass border-b border-border/50 px-3 sm:px-6"
        aria-label="Navegación de agencia"
      >
        <div className="flex items-center gap-0.5 h-10">
          <Link
            href="/workspaces"
            className={cn(
              "flex items-center gap-1.5 px-3 h-full",
              "text-sm text-muted-foreground hover:text-foreground",
              "border-b-2 border-transparent hover:border-border",
              "transition-colors duration-150",
            )}
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Workspaces
          </Link>
        </div>
      </nav>

      <main className="flex-1 px-3 sm:px-6 py-6 pb-20 md:pb-6">{children}</main>

      {/* Mobile bottom nav — hidden on md+, matches MainLayout's so it's
          never missing while navigating between the client app and agency. */}
      <nav
        className={cn(
          "md:hidden fixed bottom-0 inset-x-0 z-50 h-14",
          "glass-strong border-t border-border/50",
          "flex items-center justify-around px-4",
        )}
        aria-label="Navegación móvil"
      >
        <Link
          href="/inbox"
          className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          <span>Inbox</span>
        </Link>

        <Link
          href="/dashboard"
          className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          <span>Dashboard</span>
        </Link>

        <Link
          href="/pipeline"
          className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <Kanban className="h-5 w-5" aria-hidden="true" />
          <span>Pipeline</span>
        </Link>

        <Link
          href="/settings"
          className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
          <span>Ajustes</span>
        </Link>

        <Link
          href="/workspaces"
          className="flex flex-col items-center gap-0.5 text-xs text-primary transition-colors"
        >
          <Building2 className="h-5 w-5" aria-hidden="true" />
          <span>Agency</span>
        </Link>
      </nav>
    </div>
  );
}
