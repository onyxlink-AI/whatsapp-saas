"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Copy, CheckCheck, Loader2, ArrowRight } from "lucide-react";
import { createWorkspaceForClient } from "../services/agency-actions";
import type { UseCase } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  googleServiceAccountEmail?: string;
}

const USE_CASES: { value: UseCase; label: string; description: string }[] = [
  {
    value: "setter",
    label: "Setter",
    description: "Calificación de leads y agendamiento",
  },
  {
    value: "soporte",
    label: "Soporte",
    description: "Atención al cliente y resolución de problemas",
  },
  {
    value: "agendamiento",
    label: "Agendamiento",
    description: "Reservas y recordatorios",
  },
  {
    value: "general",
    label: "General",
    description: "Asistente virtual multipropósito",
  },
];

type Step = "basics" | "ycloud" | "openrouter" | "calendar" | "done";

const STEP_ORDER: Step[] = ["basics", "ycloud", "openrouter", "calendar", "done"];
const STEP_LABEL: Record<Step, string> = {
  basics: "Datos del cliente",
  ycloud: "WhatsApp (YCloud)",
  openrouter: "OpenRouter",
  calendar: "Google Calendar",
  done: "Listo",
};

async function putIntegration(
  workspaceId: string,
  body: {
    provider: string;
    enabled?: boolean;
    credentials?: Record<string, string>;
    config?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    return json.ok ? { ok: true } : { ok: false, error: json.error };
  } catch {
    return { ok: false, error: "Error de red" };
  }
}

async function patchTool(
  workspaceId: string,
  toolKey: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/tools/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolKey, enabled }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: json.error ?? `Error ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Error de red" };
  }
}

export function CreateWorkspaceSheet({
  open,
  onClose,
  onCreated,
  googleServiceAccountEmail,
}: Props) {
  const [step, setStep] = useState<Step>("basics");

  // Step 1 — basics
  const [name, setName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPassword, setClientPassword] = useState("");
  const [useCase, setUseCase] = useState<UseCase>("general");
  const [wantsAdvancedMemory, setWantsAdvancedMemory] = useState(false);
  const [wantsPipelineAi, setWantsPipelineAi] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCred, setCopiedCred] = useState(false);

  // Step 2 — YCloud
  const [ycloudApiKey, setYcloudApiKey] = useState("");
  const [ycloudSecret, setYcloudSecret] = useState("");

  // Step 3 — OpenRouter
  const [openrouterKey, setOpenrouterKey] = useState("");

  // Step 4 — Google Calendar
  const [wantsCalendar, setWantsCalendar] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");

  const [saving, startSave] = useTransition();

  function resetAll() {
    setStep("basics");
    setName("");
    setClientEmail("");
    setClientPassword("");
    setUseCase("general");
    setWantsAdvancedMemory(false);
    setWantsPipelineAi(false);
    setWorkspaceId(null);
    setWebhookUrl(null);
    setCredentials(null);
    setCopied(false);
    setCopiedCred(false);
    setYcloudApiKey("");
    setYcloudSecret("");
    setOpenrouterKey("");
    setWantsCalendar(false);
    setCalendarId("");
    setTimezone("America/Mexico_City");
  }

  function handleClose() {
    if (saving) return;
    resetAll();
    onClose();
  }

  function handleCopy() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyCredentials() {
    if (!credentials) return;
    navigator.clipboard.writeText(
      `Email: ${credentials.email}\nContraseña: ${credentials.password}`,
    );
    setCopiedCred(true);
    setTimeout(() => setCopiedCred(false), 2000);
  }

  function handleCreateBasics(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      const result = await createWorkspaceForClient({
        name,
        useCase,
        clientEmail: clientEmail || undefined,
        clientPassword: clientPassword || undefined,
        advancedMemoryEnabled: wantsAdvancedMemory,
        pipelineAiEnabled: wantsPipelineAi,
      });

      if (result.error || !result.workspaceId) {
        toast.error(result.error ?? "Error al crear el workspace");
        return;
      }

      setWorkspaceId(result.workspaceId);
      setWebhookUrl(result.webhookUrl ?? null);
      setCredentials(result.clientCredentials ?? null);
      toast.success("Workspace creado — sigamos configurándolo");
      onCreated();
      setStep("ycloud");
    });
  }

  function handleSaveYCloud(skip: boolean) {
    if (!workspaceId) return;
    if (skip) {
      setStep("openrouter");
      return;
    }
    startSave(async () => {
      const result = await putIntegration(workspaceId, {
        provider: "ycloud",
        enabled: true,
        credentials: {
          ycloud_api_key: ycloudApiKey,
          webhook_signing_secret: ycloudSecret,
        },
      });
      if (!result.ok) {
        toast.error(result.error ?? "Error al guardar YCloud");
        return;
      }
      toast.success("YCloud guardado");
      setStep("openrouter");
    });
  }

  function handleSaveOpenRouter(skip: boolean) {
    if (!workspaceId) return;
    if (skip) {
      setStep("calendar");
      return;
    }
    startSave(async () => {
      const result = await putIntegration(workspaceId, {
        provider: "openrouter",
        enabled: true,
        credentials: { openrouter_api_key: openrouterKey },
      });
      if (!result.ok) {
        toast.error(result.error ?? "Error al guardar OpenRouter");
        return;
      }
      toast.success("OpenRouter guardado");
      setStep("calendar");
    });
  }

  function handleSaveCalendar(skip: boolean) {
    if (!workspaceId) return;
    if (skip || !wantsCalendar) {
      setStep("done");
      return;
    }
    startSave(async () => {
      const intResult = await putIntegration(workspaceId, {
        provider: "google_calendar",
        enabled: true,
        config: {
          calendar_id: calendarId,
          timezone,
          business_hours_start: 9,
          business_hours_end: 18,
          slot_minutes: 30,
        },
      });
      if (!intResult.ok) {
        toast.error(intResult.error ?? "Error al guardar Google Calendar");
        return;
      }
      const [t1, t2] = await Promise.all([
        patchTool(workspaceId, "check_availability_google", true),
        patchTool(workspaceId, "schedule_google", true),
      ]);
      if (!t1.ok || !t2.ok) {
        toast.error(
          "Google Calendar guardado, pero no se pudieron activar ambas tools — revísalas en Settings → Tools",
        );
        setStep("done");
        return;
      }
      toast.success("Google Calendar activado");
      setStep("done");
    });
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display text-foreground">
            Nuevo cliente
          </SheetTitle>
          <SheetDescription className="text-muted-foreground">
            {step === "basics"
              ? "Da de alta un cliente (su propio workspace). Si pones su email, se crea su cuenta al instante con una contraseña — compártela y entra directo, sin correos."
              : `Paso ${stepIndex + 1} de ${STEP_ORDER.length} — ${STEP_LABEL[step]}. Puedes configurar cualquier paso opcional después en Settings.`}
          </SheetDescription>
        </SheetHeader>

        {/* ── Step: basics ─────────────────────────────────────────────── */}
        {step === "basics" && (
          <form onSubmit={handleCreateBasics} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label
                htmlFor="ws-name"
                className="text-sm font-medium text-foreground"
              >
                Nombre del negocio
                <span className="ml-1 text-destructive" aria-hidden="true">
                  *
                </span>
              </Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Clínica Dental Norte"
                required
                disabled={saving}
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="ws-email"
                className="text-sm font-medium text-foreground"
              >
                Email del cliente
                <span className="ml-1 text-muted-foreground text-xs">
                  (opcional)
                </span>
              </Label>
              <Input
                id="ws-email"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="cliente@empresa.com"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Se crea su cuenta al instante (rol admin). Sin correos: le
                compartes las credenciales y entra directo.
              </p>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="ws-password"
                className="text-sm font-medium text-foreground"
              >
                Contraseña del cliente
                <span className="ml-1 text-muted-foreground text-xs">
                  (opcional)
                </span>
              </Label>
              <Input
                id="ws-password"
                type="text"
                value={clientPassword}
                onChange={(e) => setClientPassword(e.target.value)}
                placeholder="Se genera una segura si lo dejas vacío"
                disabled={saving}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="ws-usecase"
                className="text-sm font-medium text-foreground"
              >
                Caso de uso
              </Label>
              <Select
                value={useCase}
                onValueChange={(v) => setUseCase(v as UseCase)}
                disabled={saving}
              >
                <SelectTrigger id="ws-usecase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USE_CASES.map((uc) => (
                    <SelectItem key={uc.value} value={uc.value}>
                      <span className="font-medium">{uc.label}</span>
                      <span className="ml-1.5 text-muted-foreground text-xs">
                        — {uc.description}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Activa de una vez al agente correspondiente (Setter, Soporte o
                Agendamiento) con un prompt de partida.
              </p>
            </div>

            <label className="flex items-start gap-2.5 rounded-lg border border-border/60 p-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={wantsAdvancedMemory}
                onChange={(e) => setWantsAdvancedMemory(e.target.checked)}
                disabled={saving}
              />
              <span className="text-sm text-foreground">
                Activar Memoria Inteligente Avanzada
                <span className="block text-xs text-muted-foreground mt-0.5">
                  El agente recuerda a cada contacto entre conversaciones
                  (resumen, intereses, objeciones, estado del lead). Se puede
                  activar o desactivar después en Settings.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 rounded-lg border border-border/60 p-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={wantsPipelineAi}
                onChange={(e) => setWantsPipelineAi(e.target.checked)}
                disabled={saving}
              />
              <span className="text-sm text-foreground">
                Activar Sugerencias de Pipeline con IA
                <span className="block text-xs text-muted-foreground mt-0.5">
                  El agente sugiere en qué etapa del pipeline encaja cada
                  contacto — nunca mueve nada solo, siempre requiere
                  aprobación manual. Se puede activar o desactivar después en
                  Settings.
                </span>
              </span>
            </label>

            <Button
              type="submit"
              className="w-full"
              disabled={saving || !name.trim()}
              aria-busy={saving}
            >
              {saving && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
              )}
              {saving ? "Dando de alta..." : "Dar de alta y continuar"}
            </Button>
          </form>
        )}

        {/* ── Step: YCloud ─────────────────────────────────────────────── */}
        {step === "ycloud" && (
          <div className="mt-6 space-y-5">
            {webhookUrl && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Webhook URL de este cliente
                </p>
                <p className="text-xs text-muted-foreground">
                  Pégala en YCloud → Webhooks al crear el endpoint de este
                  número.
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded bg-muted px-2 py-1.5 font-mono text-xs text-foreground break-all">
                    {webhookUrl}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    aria-label="Copiar URL"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <CheckCheck className="h-4 w-4 text-primary" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {credentials && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Credenciales del cliente
                </p>
                <p className="text-xs text-muted-foreground">
                  Compártelas con tu cliente. No se vuelven a mostrar.
                </p>
                <div className="space-y-1 font-mono text-xs mt-1">
                  <p className="text-foreground break-all">
                    <span className="text-muted-foreground">Email: </span>
                    {credentials.email}
                  </p>
                  <p className="text-foreground break-all">
                    <span className="text-muted-foreground">Contraseña: </span>
                    {credentials.password}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 gap-1.5"
                  onClick={handleCopyCredentials}
                >
                  {copiedCred ? (
                    <CheckCheck className="h-4 w-4 text-primary" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden />
                  )}
                  Copiar credenciales
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="yc-key" className="text-sm font-medium text-foreground">
                API Key de YCloud
              </Label>
              <Input
                id="yc-key"
                type="password"
                value={ycloudApiKey}
                onChange={(e) => setYcloudApiKey(e.target.value)}
                placeholder="yk_..."
                disabled={saving}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="yc-secret" className="text-sm font-medium text-foreground">
                Webhook Signing Secret
              </Label>
              <Input
                id="yc-secret"
                type="password"
                value={ycloudSecret}
                onChange={(e) => setYcloudSecret(e.target.value)}
                placeholder="whsec_..."
                disabled={saving}
                autoComplete="off"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1 text-muted-foreground"
                onClick={() => handleSaveYCloud(true)}
                disabled={saving}
              >
                Configurar después
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => handleSaveYCloud(false)}
                disabled={saving || !ycloudApiKey || !ycloudSecret}
                aria-busy={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" aria-hidden />
                )}
                Guardar y continuar
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: OpenRouter ─────────────────────────────────────────── */}
        {step === "openrouter" && (
          <div className="mt-6 space-y-5">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              Usa la API key de OpenRouter <b>del cliente</b>, no la tuya — así
              su consumo de IA se factura a su cuenta, no a la de Onyxlink.
            </div>
            <div className="space-y-2">
              <Label htmlFor="or-key" className="text-sm font-medium text-foreground">
                API Key de OpenRouter
              </Label>
              <Input
                id="or-key"
                type="password"
                value={openrouterKey}
                onChange={(e) => setOpenrouterKey(e.target.value)}
                placeholder="sk-or-..."
                disabled={saving}
                autoComplete="off"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1 text-muted-foreground"
                onClick={() => handleSaveOpenRouter(true)}
                disabled={saving}
              >
                Configurar después
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => handleSaveOpenRouter(false)}
                disabled={saving || !openrouterKey}
                aria-busy={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" aria-hidden />
                )}
                Guardar y continuar
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Google Calendar ────────────────────────────────────── */}
        {step === "calendar" && (
          <div className="mt-6 space-y-5">
            <label className="flex items-start gap-2.5 rounded-lg border border-border/60 p-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={wantsCalendar}
                onChange={(e) => setWantsCalendar(e.target.checked)}
                disabled={saving}
              />
              <span className="text-sm text-foreground">
                Este cliente quiere consultar disponibilidad y agendar citas
                directo en Google Calendar
              </span>
            </label>

            {wantsCalendar && (
              <>
                <ol className="space-y-3 rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="shrink-0 font-mono text-foreground">1.</span>
                    <span>
                      El cliente entra a{" "}
                      <span className="text-foreground">calendar.google.com</span>{" "}
                      con la cuenta donde quiere que se agenden las citas.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0 font-mono text-foreground">2.</span>
                    <span>
                      En ese calendario → <b>Configuración y uso compartido</b> →{" "}
                      <b>Compartir con determinadas personas</b> → agrega este
                      email con permiso &quot;Hacer cambios en eventos&quot;:
                      <div className="mt-1">
                        <code className="font-mono text-foreground break-all">
                          {googleServiceAccountEmail ||
                            "(configura GOOGLE_SERVICE_ACCOUNT_EMAIL)"}
                        </code>
                      </div>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0 font-mono text-foreground">3.</span>
                    <span>
                      En esa misma pantalla, baja hasta{" "}
                      <b>Integrar calendario</b> y copia el <b>&quot;ID de
                      calendario&quot;</b> — normalmente es su propio email si
                      es su calendario principal, o un ID largo terminado en{" "}
                      <span className="font-mono">@group.calendar.google.com</span>{" "}
                      si es un calendario secundario. Pégalo abajo.
                    </span>
                  </li>
                </ol>
                <div className="space-y-2">
                  <Label htmlFor="cal-id" className="text-sm font-medium text-foreground">
                    Calendar ID (el que copió el cliente en el paso 3)
                  </Label>
                  <Input
                    id="cal-id"
                    value={calendarId}
                    onChange={(e) => setCalendarId(e.target.value)}
                    placeholder="cliente@gmail.com"
                    disabled={saving}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cal-tz" className="text-sm font-medium text-foreground">
                    Zona horaria
                  </Label>
                  <Input
                    id="cal-tz"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="America/Mexico_City"
                    disabled={saving}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Identificador IANA exacto (ej. Europe/Madrid), no una
                    descripción. Horario laboral por defecto 9:00–18:00,
                    ajustable después en Settings.
                  </p>
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1 text-muted-foreground"
                onClick={() => handleSaveCalendar(true)}
                disabled={saving}
              >
                {wantsCalendar ? "Omitir" : "Continuar"}
              </Button>
              {wantsCalendar && (
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => handleSaveCalendar(false)}
                  disabled={saving || !calendarId}
                  aria-busy={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" aria-hidden />
                  )}
                  Guardar y continuar
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Step: done ───────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="mt-6 space-y-5">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">
                {name} está listo para terminar de afinarse
              </p>
              <p className="text-xs text-muted-foreground">
                Lo que sigue no se puede automatizar desde aquí — requiere
                contenido real del cliente:
              </p>
            </div>
            <ul className="space-y-1.5 text-sm text-foreground">
              <li className="flex gap-2">
                <span className="text-muted-foreground">·</span>
                Pegar la Webhook URL en el panel de YCloud del cliente
              </li>
              <li className="flex gap-2">
                <span className="text-muted-foreground">·</span>
                Cargar información del negocio, ajustar el prompt y subir la
                Knowledge Base (Settings → Negocio / Agentes / Knowledge Base)
              </li>
              <li className="flex gap-2">
                <span className="text-muted-foreground">·</span>
                Mandar un mensaje real de WhatsApp para probar de punta a
                punta antes de entregarlo
              </li>
            </ul>
            <Button variant="outline" className="w-full" onClick={handleClose}>
              Cerrar
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
