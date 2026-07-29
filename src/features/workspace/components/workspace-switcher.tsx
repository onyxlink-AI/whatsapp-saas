"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { switchWorkspace } from "@/features/workspace/services/actions";
import { cn } from "@/lib/utils";

interface WorkspaceSwitcherProps {
  workspaces: { workspace_id: string; name: string }[];
  activeId: string;
  variant?: "default" | "sidebar";
}

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  variant = "default",
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const active = workspaces.find((w) => w.workspace_id === activeId);

  function handleSelect(workspaceId: string) {
    if (workspaceId === activeId) return;
    startTransition(async () => {
      await switchWorkspace(workspaceId);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
            "max-w-[220px]",
            variant === "sidebar"
              ? "text-xs font-medium text-white/75 hover:bg-white/10 hover:text-white"
              : "font-mono text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          )}
          aria-label="Cambiar de negocio"
        >
          <span className="min-w-0 flex-1 truncate" title={active?.name}>
            {active?.name ?? "Negocio"}
          </span>
          {isPending ? (
            <Loader2
              className="h-3 w-3 shrink-0 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <ChevronsUpDown className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Cambiar de negocio</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.workspace_id}
            onSelect={() => handleSelect(w.workspace_id)}
            className="gap-2"
          >
            <Check
              className={cn(
                "h-4 w-4 shrink-0",
                w.workspace_id === activeId ? "opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />
            <span className="truncate">{w.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
