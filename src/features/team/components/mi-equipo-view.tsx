"use client";

/**
 * Mi equipo — módulo operativo (Fase 2), independiente de la pestaña técnica
 * de Ajustes → Equipo (esa sigue siendo la superficie de roles/accesos; esta
 * es la vista de "quién trabaja en qué"). Lee los mismos `users`/
 * `memberships` — invitar reutiliza el flujo seguro de InviteMemberDialog.
 */

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, UserPlus, Users } from "lucide-react";
import { InviteMemberDialog } from "./invite-member-dialog";
import { ROLE_LABELS, type TeamMember, type WorkspaceRole } from "@/features/team/types";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/features/projects/types";

interface MiEquipoProject {
  id: string;
  name: string;
  responsible_id: string | null;
}

interface MiEquipoTask {
  id: string;
  title: string;
  status: TaskStatus;
  assigned_to: string | null;
}

interface MiEquipoViewProps {
  workspaceId: string;
  initialMembers: TeamMember[];
  projects: MiEquipoProject[];
  tasks: MiEquipoTask[];
  canManage: boolean;
}

function getInitials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const ROLE_FILTER_OPTIONS: (WorkspaceRole | "all")[] = ["all", "admin", "manager", "agent", "viewer"];

export function MiEquipoView({
  workspaceId,
  initialMembers,
  projects,
  tasks,
  canManage,
}: MiEquipoViewProps) {
  const [members, setMembers] = useState(initialMembers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<WorkspaceRole | "all">("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const filtered = useMemo(() => {
    let list = members.filter((m) => m.is_active);
    if (roleFilter !== "all") list = list.filter((m) => m.role === roleFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) => (m.full_name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      );
    }
    return list;
  }, [members, search, roleFilter]);

  function countsFor(userId: string) {
    const memberTasks = tasks.filter((t) => t.assigned_to === userId);
    const memberProjects = projects.filter((p) => p.responsible_id === userId);
    return { memberTasks, memberProjects };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Busca por nombre o correo..."
            className="h-9 pl-8 text-xs"
          />
        </div>

        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as WorkspaceRole | "all")}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_FILTER_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r === "all" ? "Todos los roles" : ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canManage && (
          <Button size="sm" className="ml-auto h-9 gap-1.5 text-xs" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Añadir miembro
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 py-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Nadie coincide con este filtro</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((member) => {
            const { memberTasks, memberProjects } = countsFor(member.user_id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedMember(member)}
                className="surface-card flex items-start gap-3 p-4 text-left transition-colors hover:border-[hsl(var(--electric-lime)/0.4)]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {getInitials(member.full_name, member.email)}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium truncate">{member.full_name ?? member.email}</p>
                  <p className="text-xs text-muted-foreground truncate font-mono">{member.email}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                      {ROLE_LABELS[member.role]}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {memberTasks.length} tarea{memberTasks.length === 1 ? "" : "s"} ·{" "}
                      {memberProjects.length} proyecto{memberProjects.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <InviteMemberDialog
        open={inviteOpen}
        workspaceId={workspaceId}
        onClose={() => setInviteOpen(false)}
        onInvited={async () => {
          setInviteOpen(false);
          const res = await fetch(`/api/workspace/${workspaceId}/team`);
          if (res.ok) {
            const json = (await res.json()) as { members: TeamMember[] };
            setMembers(json.members ?? []);
          }
        }}
      />

      <Dialog open={Boolean(selectedMember)} onOpenChange={(v) => !v && setSelectedMember(null)}>
        <DialogContent className="sm:max-w-sm">
          {selectedMember && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedMember.full_name ?? selectedMember.email}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Proyectos donde es responsable
                  </p>
                  {countsFor(selectedMember.user_id).memberProjects.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ninguno todavía</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {countsFor(selectedMember.user_id).memberProjects.map((p) => (
                        <li key={p.id} className="truncate">📋 {p.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Tareas asignadas</p>
                  {countsFor(selectedMember.user_id).memberTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ninguna todavía</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {countsFor(selectedMember.user_id).memberTasks.slice(0, 8).map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{t.title}</span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                            {TASK_STATUS_LABELS[t.status]}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
