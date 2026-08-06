"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileVideo, Search } from "lucide-react";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUSES,
  contentHasScript,
  type ContentItemRow,
  type ContentStatus,
} from "@/features/content/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";

interface ScriptsViewProps {
  items: ContentItemRow[];
  members: WorkspaceMember[];
}

export function ScriptsView({ items, members }: ScriptsViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");

  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q));
    }
    return list;
  }, [items, search, statusFilter]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Busca un guion..."
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ContentStatus | "all")}>
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {CONTENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CONTENT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 py-12 text-center">
          <FileVideo className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No hay contenido que coincida</p>
        </div>
      ) : (
        <div className="rounded-md border border-border/40">
          {filtered.map((item) => {
            const responsible = members.find((m) => m.user_id === item.responsible_id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/contenido/${item.id}?from=scripts`)}
                className="flex w-full items-center gap-3 border-b border-border/30 px-3 py-2.5 text-left last:border-0 hover:bg-muted/30"
              >
                <FileVideo className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.title}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {item.platform && <span>{item.platform}</span>}
                    {responsible && <span>{responsible.full_name}</span>}
                    {!contentHasScript(item) && <span>Sin guion todavía</span>}
                  </div>
                </div>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                  {CONTENT_STATUS_LABELS[item.status]}
                </Badge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
