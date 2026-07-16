"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { GlobalSearchDialog } from "./global-search-dialog";

interface GlobalSearchLauncherProps {
  workspaceId: string;
  hasGestion: boolean;
  hasPipeline: boolean;
}

export function GlobalSearchLauncher({
  workspaceId,
  hasGestion,
  hasPipeline,
}: GlobalSearchLauncherProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only sm:ml-0 hidden md:inline text-xs">
          Buscar
        </span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-border/60 px-1 text-[10px] text-muted-foreground/70">
          ⌘K
        </kbd>
      </Button>

      <GlobalSearchDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={workspaceId}
        hasGestion={hasGestion}
        hasPipeline={hasPipeline}
      />
    </>
  );
}
