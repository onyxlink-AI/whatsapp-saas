"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Building2,
  Clapperboard,
  FolderKanban,
  Kanban,
  LayoutDashboard,
  Menu,
  MessageCircle,
  MessagesSquare,
  Network,
  PenTool,
  Phone,
  Settings,
  Users,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type AppNavIcon =
  | "dashboard"
  | "messages"
  | "team-chat"
  | "clients"
  | "pipeline"
  | "projects"
  | "whiteboard"
  | "team"
  | "content"
  | "voice"
  | "office"
  | "chatbot"
  | "settings"
  | "companies";

export interface AppNavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: AppNavIcon;
  section?: string;
  mobilePrimary?: boolean;
}

const ICONS: Record<AppNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  messages: MessageCircle,
  "team-chat": MessagesSquare,
  clients: Users,
  pipeline: Kanban,
  projects: FolderKanban,
  whiteboard: PenTool,
  team: Users2,
  content: Clapperboard,
  voice: Phone,
  office: Network,
  chatbot: Bot,
  settings: Settings,
  companies: Building2,
};

function isItemActive(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/workspaces") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebarNavigation({ items }: { items: AppNavItem[] }) {
  const pathname = usePathname();
  const sections = items.reduce<Map<string, AppNavItem[]>>((result, item) => {
    const section = item.section ?? "Tu empresa";
    const current = result.get(section) ?? [];
    current.push(item);
    result.set(section, current);
    return result;
  }, new Map());

  return (
    <nav
      className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
      aria-label="Navegación principal"
    >
      {[...sections.entries()].map(([section, sectionItems]) => (
        <div key={section} className="mb-5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
            {section}
          </p>
          <div className="space-y-1">
            {sectionItems.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium",
                    "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                    active
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-white/65 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      active
                        ? "text-primary"
                        : "text-white/45 group-hover:text-white/80",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppMobileNavigation({ items }: { items: AppNavItem[] }) {
  const pathname = usePathname();
  const marked = items.filter((item) => item.mobilePrimary);
  const primary = (marked.length > 0 ? marked : items).slice(0, 4);
  const primaryHrefs = new Set(primary.map((item) => item.href));
  const remaining = items.filter((item) => !primaryHrefs.has(item.href));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch border-t border-border/70 bg-background/95 px-2 shadow-[0_-12px_35px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:hidden"
      aria-label="Navegación móvil"
    >
      {primary.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium",
              "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" />
            )}
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="max-w-full truncate px-1">
              {item.shortLabel ?? item.label}
            </span>
          </Link>
        );
      })}

      {remaining.length > 0 && (
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
              <span>Más</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-3xl px-4 pb-8 pt-6"
          >
            <SheetHeader className="mb-5 text-left">
              <SheetTitle>Todo OnyxLink</SheetTitle>
              <SheetDescription>
                Accede al resto de áreas de tu empresa.
              </SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2">
              {remaining.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isItemActive(pathname, item.href);
                return (
                  <SheetClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-14 items-center gap-3 rounded-xl border px-3 text-sm font-medium",
                        active
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border/70 bg-card text-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </SheetClose>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </nav>
  );
}
