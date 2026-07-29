"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, CheckCircle2, Plus, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AgentCard } from "./agent-card";
import { AgentConfigSheet } from "./agent-config-sheet";
import { AgentAvatar } from "./agent-avatar";
import { AGENT_TYPE_META } from "@/features/agents/lib/agent-meta";
import { cn } from "@/lib/utils";
import type { AgentDto, AgentType } from "@/features/agents/types";

const ORDER: AgentType[] = ["setter", "soporte", "agendamiento"];

const DEFAULT_NAMES: Record<AgentType, string> = {
  setter: "Nuevo agente comercial",
  soporte: "Nuevo agente de soporte",
  agendamiento: "Nuevo asistente de citas",
};

function sortAgents(list: AgentDto[]): AgentDto[] {
  return [...list].sort(
    (a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type),
  );
}

export function AgentsTab({
  workspaceId,
  initialAgents,
}: {
  workspaceId: string;
  initialAgents: AgentDto[];
}) {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentDto[]>(() =>
    sortAgents(initialAgents),
  );
  const [editing, setEditing] = useState<AgentDto | null>(null);
  const [pending, setPending] = useState<AgentDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [newType, setNewType] = useState<AgentType>("setter");
  const [newName, setNewName] = useState(DEFAULT_NAMES.setter);

  const currentActive = agents.find((a) => a.isActive) ?? null;

  function requestActivate(agentId: string) {
    const target = agents.find((a) => a.id === agentId);
    if (!target || target.isActive) return;
    setPending(target);
  }

  async function confirmActivate() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/agents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: pending.id, setActive: true }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo activar el agente");
        return;
      }
      setAgents((prev) =>
        prev.map((a) => ({ ...a, isActive: a.id === pending.id })),
      );
      toast.success(`${pending.name} está activo`);
      router.refresh();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  function handleSaved(updated: Partial<AgentDto> & { id: string }) {
    setAgents((prev) =>
      sortAgents(
        prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
      ),
    );
  }

  function openCreate() {
    setNewType("setter");
    setNewName(DEFAULT_NAMES.setter);
    setCreating(true);
  }

  function chooseType(type: AgentType) {
    setNewName((current) =>
      Object.values(DEFAULT_NAMES).includes(current) ? DEFAULT_NAMES[type] : current,
    );
    setNewType(type);
  }

  async function createAgent() {
    const name = newName.trim();
    if (!name) {
      toast.error("Escribe un nombre para el agente");
      return;
    }
    setCreatingBusy(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newType, name }),
      });
      const json = (await res.json()) as { agent?: AgentDto; error?: string };
      if (!res.ok || !json.agent) {
        toast.error(json.error ?? "No se pudo crear el agente");
        return;
      }
      setAgents((prev) => sortAgents([...prev, json.agent!]));
      setCreating(false);
      setEditing(json.agent);
      toast.success("Agente creado. Ahora puedes configurarlo y probarlo.");
      router.refresh();
    } catch {
      toast.error("No se pudo conectar con el servidor");
    } finally {
      setCreatingBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Centro de agentes
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
              Crea, configura y prueba tu agente
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Prepara distintos perfiles y activa solo el que debe responder.
              Puedes probar cada conversación aquí antes de conectar WhatsApp.
            </p>
          </div>
          <Button onClick={openCreate} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Crear agente
          </Button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/65 px-3 py-2.5 text-sm">
            <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>
              <strong>{agents.length}</strong> {agents.length === 1 ? "perfil guardado" : "perfiles guardados"}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/65 px-3 py-2.5 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            <span>
              {currentActive ? `${currentActive.name} responde ahora` : "Ningún agente está atendiendo"}
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          🧪 La prueba utiliza OpenRouter en un entorno seguro. YCloud solo se
          necesita cuando quieras conectarlo a WhatsApp.
        </p>
      </div>

      {agents.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              busy={busy}
              onConfigure={setEditing}
              onActivate={requestActivate}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Bot className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 font-medium text-foreground">Todavía no hay agentes</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea el primero, enséñale cómo debe responder y pruébalo sin conectar WhatsApp.
          </p>
          <Button onClick={openCreate} className="mt-4 gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Crear mi primer agente
          </Button>
        </div>
      )}

      {editing && (
        <AgentConfigSheet
          key={editing.id}
          workspaceId={workspaceId}
          agent={editing}
          open={!!editing}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear un nuevo agente</DialogTitle>
            <DialogDescription>
              Elige su misión y ponle un nombre. Después podrás ajustar el
              avatar, el modelo, las instrucciones y probarlo antes de conectarlo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2.5">
              <Label>¿Qué trabajo hará principalmente?</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {ORDER.map((type) => {
                  const meta = AGENT_TYPE_META[type];
                  const selected = newType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => chooseType(type)}
                      aria-pressed={selected}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <AgentAvatar
                        avatarKey={type}
                        name={meta.label}
                        className="mb-3 h-10 w-10"
                      />
                      <span className="block text-sm font-semibold text-foreground">
                        {meta.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {meta.tagline}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-agent-name">Nombre del agente</Label>
              <Input
                id="new-agent-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={60}
                placeholder="Ej.: Carlos"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createAgent();
                }}
              />
              <p className="text-xs text-muted-foreground">
                Podrás cambiarlo después junto al avatar y el modelo de IA.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button onClick={createAgent} disabled={creatingBusy || !newName.trim()}>
              {creatingBusy ? "Creando..." : "Crear y configurar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pending}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activar a {pending?.name}</DialogTitle>
            <DialogDescription>
              {currentActive && currentActive.id !== pending?.id
                ? `Esto desactivará a ${currentActive.name}. Solo un agente puede estar activo a la vez.`
                : "¿Activar este agente?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmActivate} disabled={busy} aria-busy={busy}>
              Activar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
