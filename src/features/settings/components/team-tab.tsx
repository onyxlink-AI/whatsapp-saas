"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  UserPlus,
  UserMinus,
  UserCheck,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { InviteMemberDialog } from "@/features/team/components/invite-member-dialog";
import type { TeamMember, WorkspaceRole } from "@/features/team/types";

interface Props {
  workspaceId: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  admin: "Admin",
  manager: "Manager",
  agent: "Agente",
  viewer: "Solo ver",
};

// Role badge styles using design-system tokens (dark theme)
const ROLE_BADGE: Record<WorkspaceRole, string> = {
  admin: "border-primary/30 bg-primary/10 text-primary",
  manager: "border-info/30 bg-info/10 text-info",
  agent: "border-success/30 bg-success/10 text-success",
  viewer: "border-border bg-muted text-muted-foreground",
};

const SELECTABLE_ROLES: WorkspaceRole[] = [
  "admin",
  "manager",
  "agent",
  "viewer",
];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ──────────────────────────────────────────────────────────────────────────────

function TeamSkeleton() {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center justify-between px-4 py-3.5 ${i < 2 ? "border-b border-border" : ""}`}
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Empty state
// ──────────────────────────────────────────────────────────────────────────────

function TeamEmpty({ onInvite }: { onInvite: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted">
        <Users className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <div>
        <p className="font-display text-sm font-semibold text-foreground">
          Solo tú en el equipo
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Invita a colaboradores para que te ayuden a contestar mensajes.
        </p>
      </div>
      <Button size="sm" className="gap-1.5 mt-1" onClick={onInvite}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Invitar miembro
      </Button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

export function TeamTab({ workspaceId }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);

  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState<string | null>(null);

  // ── Fetch team ─────────────────────────────────────────────────────────────
  const fetchTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/team`);
      if (!res.ok) throw new Error("Error al cargar el equipo");
      const json = (await res.json()) as { members: TeamMember[] };
      setMembers(json.members ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetchTeam resets loading/error before each (re)fetch
    fetchTeam();
  }, [fetchTeam]);

  // ── Change role ────────────────────────────────────────────────────────────
  async function handleRoleChange(userId: string, role: WorkspaceRole) {
    setUpdatingRole(userId);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/team`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Error al actualizar rol");
      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, role } : m)),
      );
      toast.success("Rol actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setUpdatingRole(null);
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────────
  async function handleToggleActive(member: TeamMember) {
    const next = !member.is_active;
    setTogglingActive(member.user_id);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/team`, {
        method: next ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          next
            ? { userId: member.user_id, is_active: true }
            : { userId: member.user_id },
        ),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Error al actualizar");
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === member.user_id ? { ...m, is_active: next } : m,
        ),
      );
      toast.success(next ? "Miembro reactivado" : "Miembro desactivado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setTogglingActive(null);
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-32" />
        </div>
        <TeamSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-destructive/30 bg-destructive/5">
          <AlertCircle
            className="h-5 w-5 text-destructive"
            aria-hidden="true"
          />
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-foreground">
            No se pudo cargar el equipo
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTeam}
          className="gap-1.5"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-foreground">
            Equipo
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Administra quién tiene acceso a tu negocio.
        </p>
      </div>

      {/* Members list or empty state */}
      {members.length === 0 ? (
        <TeamEmpty onInvite={() => setInviteOpen(true)} />
      ) : (
        <>
          {/* Actions bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">
                {members.length}
              </span>{" "}
              miembro{members.length !== 1 ? "s" : ""}
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Invitar miembro
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            {members.map((member, i) => (
              <div
                key={member.id}
                className={`flex items-center justify-between px-4 py-3.5 transition-colors duration-150 hover:bg-muted/40 group ${
                  i < members.length - 1 ? "border-b border-border" : ""
                } ${!member.is_active ? "opacity-60" : ""}`}
              >
                {/* Identity */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold font-mono ${
                      member.is_active
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                    aria-hidden="true"
                  >
                    {getInitials(member.full_name, member.email)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {member.full_name ?? member.email}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {member.email}
                    </p>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {/* Joined date — hidden on mobile */}
                  <span className="hidden sm:block text-xs text-muted-foreground font-mono mr-1">
                    {formatDate(member.created_at)}
                  </span>

                  {/* Status badge */}
                  {!member.is_active && (
                    <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-0.5 text-xs font-medium text-destructive">
                      Inactivo
                    </span>
                  )}

                  {/* Role selector */}
                  <Select
                    value={member.role}
                    onValueChange={(v) =>
                      handleRoleChange(member.user_id, v as WorkspaceRole)
                    }
                    disabled={
                      updatingRole === member.user_id || !member.is_active
                    }
                  >
                    <SelectTrigger
                      className={`h-7 w-auto gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[member.role]}`}
                      aria-label={`Cambiar rol de ${member.full_name ?? member.email}`}
                    >
                      {updatingRole === member.user_id ? (
                        <Loader2
                          className="h-3 w-3 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <SelectValue />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {SELECTABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Activate / Deactivate toggle */}
                  <button
                    onClick={() => handleToggleActive(member)}
                    disabled={togglingActive === member.user_id}
                    aria-label={
                      member.is_active
                        ? `Desactivar a ${member.full_name ?? member.email}`
                        : `Reactivar a ${member.full_name ?? member.email}`
                    }
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                      member.is_active
                        ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100"
                        : "text-success hover:bg-success/10"
                    }`}
                  >
                    {togglingActive === member.user_id ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : member.is_active ? (
                      <UserMinus className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <UserCheck className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <InviteMemberDialog
        open={inviteOpen}
        workspaceId={workspaceId}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          setInviteOpen(false);
          void fetchTeam();
        }}
      />
    </div>
  );
}
