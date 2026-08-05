"use client";

/**
 * Reusable "Añadir miembro" flow — el mismo flujo seguro que Ajustes → Equipo
 * (POST /api/workspace/[id]/team, sin email/SMTP, credenciales de un solo
 * vistazo). Se usa tanto desde Mi equipo (Fase 2) como, embebido, desde los
 * selectores de responsable/asignado ("+ Añadir miembro") para no perder el
 * formulario que se estaba llenando.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, CheckCheck, Loader2, UserPlus } from "lucide-react";
import type { WorkspaceRole } from "@/features/team/types";

interface InviteMemberDialogProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  /** Called once the membership is confirmed — pasa el user_id para poder
   * seleccionarlo automáticamente donde se abrió el flujo. */
  onInvited: (userId: string) => void;
}

export function InviteMemberDialog({
  open,
  workspaceId,
  onClose,
  onInvited,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("agent");
  const [password, setPassword] = useState("");
  const [inviting, setInviting] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setRole("agent");
    setPassword("");
    setCreatedCreds(null);
    setCopied(false);
    setPendingUserId(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleCopy() {
    if (!createdCreds) return;
    navigator.clipboard.writeText(`Email: ${createdCreds.email}\nContraseña: ${createdCreds.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDone() {
    if (pendingUserId) onInvited(pendingUserId);
    handleClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, password: password || undefined }),
      });
      const json = (await res.json()) as {
        error?: string;
        userId?: string;
        credentials?: { email: string; password: string } | null;
      };
      if (!res.ok) {
        if (json.error === "TEAM_SEAT_LIMIT_REACHED") {
          throw new Error("Sin plazas libres — pide a Onyxlink que amplíe el límite o desactiva a alguien más primero");
        }
        throw new Error(json.error ?? "Error al crear el usuario");
      }

      if (json.credentials && json.userId) {
        setCreatedCreds(json.credentials);
        setPendingUserId(json.userId);
        toast.success("Cuenta creada");
      } else if (json.userId) {
        toast.success(`${email} agregado al equipo`);
        onInvited(json.userId);
        handleClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setInviting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{createdCreds ? "Datos de acceso" : "Añadir miembro"}</DialogTitle>
        </DialogHeader>

        {createdCreds ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Comparte este usuario y contraseña — no los vas a poder ver de nuevo.
            </p>
            <div className="space-y-1 rounded-lg border border-warning/30 bg-warning/5 p-3 font-mono text-xs">
              <p className="text-foreground break-all">
                <span className="text-muted-foreground">Email: </span>
                {createdCreds.email}
              </p>
              <p className="text-foreground break-all">
                <span className="text-muted-foreground">Contraseña: </span>
                {createdCreds.password}
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
                {copied ? <CheckCheck className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                Copiar
              </Button>
              <Button type="button" size="sm" onClick={handleDone}>
                Listo
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email-inline" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="invite-email-inline"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colaborador@empresa.com"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role-inline" className="text-sm font-medium">
                Rol
              </Label>
              <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
                <SelectTrigger id="invite-role-inline" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="agent">Agente</SelectItem>
                  <SelectItem value="viewer">Solo ver</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se crea al instante, sin correo — copia los datos y compártelos.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-password-inline" className="text-sm font-medium">
                Contraseña <span className="text-muted-foreground text-xs">(opcional)</span>
              </Label>
              <Input
                id="invite-password-inline"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Se genera una segura si lo dejas vacío"
                className="font-mono text-sm"
                autoComplete="off"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={inviting} aria-busy={inviting} className="gap-1.5">
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {inviting ? "Creando..." : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
