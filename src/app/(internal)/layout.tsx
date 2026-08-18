import { redirect } from "next/navigation";
import Image from "next/image";
import { LogOut, ShieldCheck } from "lucide-react";
import { getPlatformAccess } from "@/lib/auth/platform-access";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspace,
  getDefaultRouteForWorkspace,
} from "@/features/workspace/services/active-workspace";
import { logout } from "@/features/auth/services/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AppMobileNavigation,
  AppSidebarNavigation,
  type AppNavItem,
} from "@/components/app-navigation";

// TAREA 2 — zona interna de OnyxLink ("Dirección"), separada a propósito
// del layout (agency) existente: (agency) protege operaciones exclusivas de
// super_admin (Empresas, aprovisionamiento, credenciales) y NO debe
// ampliarse para dar cabida a internal_admin. Este layout usa
// getPlatformAccess() (la resolución equivalente segura que permite el
// encargo cuando no se puede usar requirePlatformStaff() — pensado para
// Server Actions/rutas API, no para páginas, que necesitan redirect() en
// vez de una NextResponse) y NUNCA depende de que el usuario tenga un
// workspace activo: un internal_admin puede no pertenecer a ninguno.
export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getPlatformAccess();

  if (!access) redirect("/login");

  if (!access.isPlatformStaff) {
    // Igual que (agency)/layout.tsx: a un cliente rechazado se le manda a
    // su propio destino por defecto, nunca a un callejón sin salida.
    const supabase = await createClient();
    const membership = await getActiveWorkspace(supabase, access.userId);
    redirect(
      membership
        ? await getDefaultRouteForWorkspace(supabase, membership.workspace_id)
        : "/onboarding",
    );
  }

  const isSuperAdmin = access.isSuperAdmin;

  const navItems: AppNavItem[] = [
    {
      href: "/direccion",
      label: "Dirección",
      icon: "direction",
      section: "Interno",
      mobilePrimary: true,
    },
  ];

  // "No permitir a internal_admin entrar en /workspaces": no basta con no
  // mostrar el enlace aquí (eso es solo UX) — /workspaces sigue protegido
  // por su propia comprobación is_super_admin en (agency)/layout.tsx,
  // ajena a este layout y sin tocar. Este condicional es exclusivamente
  // sobre qué ve cada rol, no la barrera de seguridad real.
  if (isSuperAdmin) {
    navItems.push({
      href: "/workspaces",
      label: "Empresas",
      icon: "companies",
      section: "Interno",
      mobilePrimary: true,
    });
  }

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
            Dirección
          </p>
        </div>

        <div className="mx-3 mb-6 flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/15 px-3 py-3 text-white">
          <ShieldCheck className="h-5 w-5 text-[#A0DCDB]" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold">Zona interna</p>
            <p className="text-[10px] text-white/45">Solo personal de Onyxlink</p>
          </div>
        </div>

        <AppSidebarNavigation items={navItems} />

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {(access.email[0] ?? "O").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white/80">{access.email}</p>
              <p className="text-[10px] text-white/35">
                {isSuperAdmin ? "Superadministrador" : "Administrador interno"}
              </p>
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
          <div className="lg:hidden">
            <Image
              src="/brand/onyxlink-logo.png"
              alt="OnyxLink"
              width={112}
              height={22}
              className="h-auto w-28"
              priority
            />
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-xs font-semibold text-foreground">Dirección OnyxLink</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <form action={logout} className="lg:hidden">
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
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
