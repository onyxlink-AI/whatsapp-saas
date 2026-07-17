"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Users, FolderKanban, Kanban } from "lucide-react";
import { globalSearch } from "@/features/search/services/global-search";
import type { SearchResultItem, SearchResultType } from "@/features/search/types";

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  hasGestion: boolean;
  hasPipeline: boolean;
}

const GROUP_LABEL: Record<SearchResultType, string> = {
  client: "Clientes",
  project: "Proyectos",
  deal: "Ventas",
};

const GROUP_ICON: Record<SearchResultType, React.ReactNode> = {
  client: <Users className="h-4 w-4" />,
  project: <FolderKanban className="h-4 w-4" />,
  deal: <Kanban className="h-4 w-4" />,
};

const GROUP_ROUTE: Record<SearchResultType, string> = {
  client: "/clientes",
  project: "/proyectos",
  deal: "/pipeline",
};

export function GlobalSearchDialog({
  open,
  onOpenChange,
  workspaceId,
  hasGestion,
  hasPipeline,
}: GlobalSearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      globalSearch(workspaceId, query).then((data) => {
        setResults(data);
        setLoading(false);
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, workspaceId]);

  const visibleResults = results.filter((r) => {
    if (r.type === "client" || r.type === "project") return hasGestion;
    if (r.type === "deal") return hasPipeline;
    return true;
  });

  const grouped = visibleResults.reduce<Record<SearchResultType, SearchResultItem[]>>(
    (acc, item) => {
      acc[item.type] = acc[item.type] ?? [];
      acc[item.type].push(item);
      return acc;
    },
    { client: [], project: [], deal: [] },
  );

  function handleSelect(item: SearchResultItem) {
    onOpenChange(false);
    router.push(`${GROUP_ROUTE[item.type]}?open=${item.id}`);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar clientes, proyectos, negocios..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!loading && query.trim() && visibleResults.length === 0 && (
          <CommandEmpty>Sin resultados</CommandEmpty>
        )}
        {(["client", "project", "deal"] as SearchResultType[]).map((type) =>
          grouped[type].length > 0 ? (
            <CommandGroup key={type} heading={GROUP_LABEL[type]}>
              {grouped[type].map((item) => (
                <CommandItem
                  key={`${item.type}-${item.id}`}
                  value={`${item.type}-${item.id}-${item.title}`}
                  onSelect={() => handleSelect(item)}
                >
                  {GROUP_ICON[item.type]}
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{item.title}</span>
                    {item.subtitle && (
                      <span className="text-xs text-muted-foreground truncate">
                        {item.subtitle}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null,
        )}
      </CommandList>
    </CommandDialog>
  );
}
