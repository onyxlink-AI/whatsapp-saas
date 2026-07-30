import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspace,
  getDefaultRouteForWorkspace,
} from "@/features/workspace/services/active-workspace";
import { logout } from "@/features/auth/services/actions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AppMobileNavigation,
  AppSidebarNavigation,
  type AppNavItem,
} from "@/components/app-navigation";

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

  const navItems: AppNavItem[] = [
    {
      href: "/workspaces",
      label: "Empresas",
      icon: "companies",
      section: "Administración",
      mobilePrimary: true,
    },
    {
      href: "/dashboard",
      label: "Volver al inicio",
      shortLabel: "Inicio",
      icon: "dashboard",
      section: "Aplicación",
      mobilePrimary: true,
    },
    {
      href: "/inbox",
      label: "Conversaciones",
      shortLabel: "Mensajes",
      icon: "messages",
      section: "Aplicación",
      mobilePrimary: true,
    },
    {
      href: "/settings",
      label: "Ajustes de empresa",
      shortLabel: "Ajustes",
      icon: "settings",
      section: "Aplicación",
      mobilePrimary: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <aside className="app-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col lg:flex">
        <div className="flex h-20 flex-col items-start justify-center px-5">
          <Image
            src="/brand/onyxlink-logo.png"
            alt="OnyxLink"
            width={150}
            height={30}
            className="h-auto w-[9.4rem]"
            priority
          />
          <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.18em] text-white/30">
            Agency Console
          </p>
        </div>

        <div className="mx-3 mb-6 flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/15 px-3 py-3 text-white">
          <ShieldCheck className="h-5 w-5 text-[#A0DCDB]" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold">Panel de administración</p>
            <p className="text-[10px] text-white/45">Solo para OnyxLink</p>
          </div>
        </div>

        <AppSidebarNavigation items={navItems} />

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {(user.email?.[0] ?? "O").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white/80">{user.email}</p>
              <p className="text-[10px] text-white/35">Superadministrador</p>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Link href="/workspaces" className="app-sidebar rounded-lg px-3 py-2 lg:hidden">
            <Image
              src="/brand/onyxlink-logo.png"
              alt="OnyxLink"
              width={112}
              height={22}
              className="h-auto w-28"
              priority
            />
          </Link>
          <div className="hidden items-center gap-2 lg:flex">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-xs font-semibold text-foreground">Administración OnyxLink</span>
            <span className="text-xs text-muted-foreground">· Empresas y productos</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <form action={logout} className="lg:hidden">
              <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión">
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 pb-20 sm:px-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      <AppMobileNavigation items={navItems} />
    </div>
  );
}
