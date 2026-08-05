import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Building2, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/features/auth/services/actions";
import {
  getActiveWorkspace,
  listMemberships,
} from "@/features/workspace/services/active-workspace";
import { WorkspaceSwitcher } from "@/features/workspace/components/workspace-switcher";
import { isOfficeVirtualEnabled } from "@/features/office-virtual/access";
import { canSeeChatbotNav } from "@/features/chatbot/access";
import { ThemeToggle } from "@/components/theme-toggle";
import { SettingsLockToggle } from "@/features/settings/components/settings-lock-toggle";
import { GlobalSearchLauncher } from "@/features/search/components/global-search-launcher";
import { HelpAssistantLauncher } from "@/features/help-assistant/components/help-assistant-launcher";
import { Button } from "@/components/ui/button";
import {
  AppMobileNavigation,
  AppSidebarNavigation,
  type AppNavItem,
} from "@/components/app-navigation";

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
    memberships.find((membership) => membership.workspace_id === activeId)
      ?.name ?? null;

  const activeWorkspaceRow = activeId
    ? (
        await supabase
          .from("workspaces")
          .select(
            "vapi_assistant_id, whatsapp_agent_enabled, gestion_enabled, office_virtual_enabled, chatbot_enabled, team_chat_enabled",
          )
          .eq("id", activeId)
          .maybeSingle()
      ).data
    : null;

  const hasVoiceAgent = Boolean(activeWorkspaceRow?.vapi_assistant_id);
  const hasWhatsappAgent = activeWorkspaceRow?.whatsapp_agent_enabled !== false;
  const hasGestion = activeWorkspaceRow?.gestion_enabled === true;
  const hasOfficeVirtual = isOfficeVirtualEnabled(activeWorkspaceRow);
  const hasChatbot = canSeeChatbotNav(isSuperAdmin, activeWorkspaceRow);
  const hasTeamChat = activeWorkspaceRow?.team_chat_enabled === true;

  const navItems: AppNavItem[] = [];

  if (hasWhatsappAgent) {
    navItems.push(
      {
        href: "/dashboard",
        label: "Inicio",
        icon: "dashboard",
        section: "Trabajo diario",
        mobilePrimary: true,
      },
      {
        href: "/inbox",
        label: "Conversaciones",
        shortLabel: "Mensajes",
        icon: "messages",
        section: "Trabajo diario",
        mobilePrimary: true,
      },
    );
  }

  if (hasTeamChat) {
    navItems.push({
      href: "/chat",
      label: "Chat de equipo",
      shortLabel: "Chat",
      icon: "team-chat",
      section: "Trabajo diario",
    });
  }

  if (hasGestion) {
    navItems.push(
      {
        href: "/clientes",
        label: "Clientes",
        icon: "clients",
        section: "Gestión",
        mobilePrimary: true,
      },
      {
        href: "/pipeline",
        label: "Oportunidades",
        shortLabel: "Ventas",
        icon: "pipeline",
        section: "Gestión",
      },
      {
        href: "/proyectos",
        label: "Proyectos",
        icon: "projects",
        section: "Gestión",
        mobilePrimary: true,
      },
      {
        href: "/mi-equipo",
        label: "Mi equipo",
        icon: "team",
        section: "Gestión",
      },
      {
        href: "/contenido",
        label: "Contenido",
        icon: "content",
        section: "Gestión",
      },
    );
  }

  if (hasWhatsappAgent && !hasGestion) {
    navItems.push({
      href: "/pipeline",
      label: "Oportunidades",
      shortLabel: "Ventas",
      icon: "pipeline",
      section: "Gestión",
      mobilePrimary: true,
    });
  }

  if (hasWhatsappAgent && hasVoiceAgent) {
    navItems.push({
      href: "/asistente-ai",
      label: "Agente de voz",
      icon: "voice",
      section: "Equipo de IA",
    });
  }

  if (hasOfficeVirtual) {
    navItems.push({
      href: "/oficina-virtual",
      label: "Oficina Virtual",
      shortLabel: "Oficina",
      icon: "office",
      section: "Equipo de IA",
      mobilePrimary: !hasGestion,
    });
  }

  if (hasChatbot) {
    navItems.push({
      href: "/chatbot",
      label: "Chatbot",
      icon: "chatbot",
      section: "Equipo de IA",
    });
  }

  navItems.push({
    href: "/settings",
    label: "Ajustes",
    icon: "settings",
    section: "Empresa",
    mobilePrimary: true,
  });

  if (isSuperAdmin) {
    navItems.push({
      href: "/workspaces",
      label: "Empresas",
      icon: "companies",
      section: "OnyxLink",
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
        </div>

        {workspaceName && activeId && (
          <div className="mx-3 mb-6 rounded-xl border border-white/10 bg-white/[0.045] p-2">
            <p className="px-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-white/35">
              Empresa activa
            </p>
            {memberships.length > 1 ? (
              <WorkspaceSwitcher
                workspaces={memberships.map((membership) => ({
                  workspace_id: membership.workspace_id,
                  name: membership.name,
                }))}
                activeId={activeId}
                variant="sidebar"
              />
            ) : (
              <p className="truncate px-2 py-2 text-sm font-medium text-white/85" title={workspaceName}>
                {workspaceName}
              </p>
            )}
          </div>
        )}

        <AppSidebarNavigation items={navItems} />

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {(user.email?.[0] ?? "O").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white/80">{user.email}</p>
              <p className="text-[10px] text-white/35">
                {isSuperAdmin ? "Superadministrador" : "Cuenta de empresa"}
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
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Link href="/dashboard" className="app-sidebar rounded-lg px-3 py-2 lg:hidden">
            <Image
              src="/brand/onyxlink-logo.png"
              alt="OnyxLink"
              width={112}
              height={22}
              className="h-auto w-28"
              priority
            />
          </Link>

          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-xs font-medium text-muted-foreground">Empresa activa</span>
            {workspaceName && (
              <>
                <span className="text-border" aria-hidden="true">/</span>
                <span className="truncate text-xs font-semibold text-foreground">{workspaceName}</span>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {activeId && (
              <GlobalSearchLauncher
                workspaceId={activeId}
                hasGestion={hasGestion}
                hasPipeline={hasWhatsappAgent || hasGestion}
              />
            )}
            {activeId && <HelpAssistantLauncher workspaceId={activeId} />}
            <SettingsLockToggle />
            <ThemeToggle />
            <form action={logout} className="lg:hidden">
              <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión">
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-16 lg:pb-0">{children}</main>
      </div>

      <AppMobileNavigation items={navItems} />
    </div>
  );
}
