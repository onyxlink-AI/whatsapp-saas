"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Copy,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ModelPicker } from "@/features/agents/components/model-picker";

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider =
  | "ycloud"
  | "openrouter"
  | "highlevel"
  | "google_calendar"
  | "airtable"
  | "telegram";

type IntegrationData = {
  provider: Provider;
  enabled: boolean;
  credentials: Record<string, string>;
  oauth_tokens: Record<string, string>;
  config: Record<string, unknown>;
  // HighLevel-only: inbound contact-sync webhook token (low-sensitivity,
  // returned unmasked by the integrations GET so the UI can show the URL).
  highlevel_webhook_secret?: string;
  highlevel_webhook_url?: string;
};

// HighLevel pipeline + stages, as returned by the pipelines endpoint.
type HLPipelineOption = {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
};

// Native <select> styling, matching the setter advanced-config selects.
const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findIntegration(
  integrations: IntegrationData[],
  provider: Provider,
): IntegrationData | undefined {
  return integrations.find((i) => i.provider === provider);
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="font-display text-base font-medium text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {open ? (
          <ChevronDown
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-hidden
          />
        ) : (
          <ChevronRight
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-hidden
          />
        )}
      </button>

      {open && <div className="space-y-4 pt-2">{children}</div>}
    </div>
  );
}

// ─── YCloud section ───────────────────────────────────────────────────────────

function YCloudSection({
  workspaceId,
  initial,
  onSaved,
}: {
  workspaceId: string;
  initial: IntegrationData | undefined;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState(
    initial?.credentials?.ycloud_api_key ?? "",
  );
  const [phone, setPhone] = useState(
    (initial?.config?.phone_number as string | undefined) ?? "",
  );
  const [secret, setSecret] = useState(
    initial?.credentials?.webhook_signing_secret ?? "",
  );
  const [bufferSeconds, setBufferSeconds] = useState<number>(
    (initial?.config?.buffer_silence_seconds as number | undefined) ?? 30,
  );
  const [messagesInMemory, setMessagesInMemory] = useState<number>(
    (initial?.config?.message_history_window as number | undefined) ?? 10,
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/ycloud?wsid=${workspaceId}`
      : `/api/webhooks/ycloud?wsid=${workspaceId}`;

  function handleCopy() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/integrations/test`,
        {
          method: "POST",
        },
      );
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        balance?: unknown;
      };
      if (json.ok) {
        const bal = json.balance as Record<string, unknown> | undefined;
        const display = bal
          ? ` — Saldo: ${bal.balance ?? "?"} ${bal.currency ?? ""}`
          : "";
        toast.success(`YCloud conectado${display}`);
      } else {
        toast.error(json.error ?? "Error al probar la conexión");
      }
    } catch {
      toast.error("Error de red al probar la conexión");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "ycloud",
          credentials: {
            ycloud_api_key: apiKey,
            webhook_signing_secret: secret,
          },
          config: {
            phone_number: phone,
            buffer_silence_seconds: bufferSeconds,
            message_history_window: messagesInMemory,
          },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        toast.success("Configuración de YCloud guardada");
        onSaved();
      } else {
        toast.error(json.error ?? "Error al guardar");
      }
    } catch {
      toast.error("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="YCloud (WhatsApp)"
      description="Conecta tu número de WhatsApp Business a través de YCloud."
      defaultOpen
    >
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="ycloud-api-key">API Key</Label>
          <Input
            id="ycloud-api-key"
            type="password"
            placeholder="yk_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ycloud-phone">Número de WhatsApp (E.164)</Label>
          <Input
            id="ycloud-phone"
            type="tel"
            placeholder="+521234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ycloud-secret">Webhook Signing Secret</Label>
          <Input
            id="ycloud-secret"
            type="password"
            placeholder="whsec_..."
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label>Webhook URL</Label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={webhookUrl}
              className="font-mono text-xs text-muted-foreground"
              aria-label="Webhook URL (solo lectura)"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              aria-label="Copiar URL del webhook"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pega esta URL en la configuración de webhooks de YCloud.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ycloud-buffer">
            Tiempo de espera del buffer (segundos)
          </Label>
          <Input
            id="ycloud-buffer"
            type="number"
            min={3}
            max={120}
            step={1}
            value={bufferSeconds}
            onChange={(e) =>
              setBufferSeconds(
                Math.min(120, Math.max(3, Number(e.target.value) || 30)),
              )
            }
          />
          <p className="text-xs text-muted-foreground">
            La IA espera este tiempo de silencio tras el último mensaje antes de
            responder, para agrupar mensajes seguidos. Por defecto 30s.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ycloud-memory">Mensajes en memoria de la IA</Label>
          <Input
            id="ycloud-memory"
            type="number"
            min={5}
            max={50}
            step={1}
            value={messagesInMemory}
            onChange={(e) =>
              setMessagesInMemory(
                Math.min(50, Math.max(5, Number(e.target.value) || 10)),
              )
            }
          />
          <p className="text-xs text-muted-foreground">
            Cuántos mensajes recientes recuerda la IA al responder (entre 5 y
            50). Por defecto 10.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing}
            aria-busy={testing}
          >
            {testing && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Probar conexión
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </Section>
  );
}

// ─── OpenRouter section ───────────────────────────────────────────────────────

function OpenRouterSection({
  workspaceId,
  initial,
  onSaved,
}: {
  workspaceId: string;
  initial: IntegrationData | undefined;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState(
    initial?.credentials?.openrouter_api_key ?? "",
  );
  const [model, setModel] = useState(
    (initial?.config?.default_model as string | undefined) ??
      "anthropic/claude-sonnet-4.6",
  );
  const [fallbackModel, setFallbackModel] = useState(
    (initial?.config?.fallback_model as string | undefined) ?? "",
  );
  const [dailyBudget, setDailyBudget] = useState<number>(
    (initial?.config?.daily_budget_tokens as number | undefined) ?? 1_000_000,
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openrouter",
          credentials: { openrouter_api_key: apiKey },
          config: {
            default_model: model,
            fallback_model: fallbackModel,
            daily_budget_tokens: dailyBudget,
          },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        toast.success("Configuración de OpenRouter guardada");
        onSaved();
      } else {
        toast.error(json.error ?? "Error al guardar");
      }
    } catch {
      toast.error("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="OpenRouter"
      description="Gateway de modelos de lenguaje. Requerido para el agente de IA."
    >
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="or-api-key">API Key</Label>
          <Input
            id="or-api-key"
            type="password"
            placeholder="sk-or-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label>Modelo por defecto (se usa si un agente no elige otro)</Label>
          <ModelPicker
            value={model}
            onChange={setModel}
            emptyHint="Modelo que se usa cuando un agente no define el suyo."
          />
        </div>

        <div className="space-y-2">
          <Label>Modelo de respaldo</Label>
          <ModelPicker
            value={fallbackModel || null}
            onChange={setFallbackModel}
            emptyHint="Opcional. Se usa si el modelo principal falla."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="or-budget">Budget diario (tokens)</Label>
          <Input
            id="or-budget"
            type="number"
            min={0}
            step={100000}
            value={dailyBudget}
            onChange={(e) => setDailyBudget(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            El agente se detendrá cuando alcance este límite diario de tokens.
          </p>
        </div>

        <div className="pt-2">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </Section>
  );
}

// ─── Telegram section (💬 Chatbot channel) ────────────────────────────────────

function TelegramSection({
  workspaceId,
  initial,
  onSaved,
}: {
  workspaceId: string;
  initial: IntegrationData | undefined;
  onSaved: () => void;
}) {
  const [botToken, setBotToken] = useState(
    initial?.credentials?.telegram_bot_token ?? "",
  );
  const [saving, setSaving] = useState(false);
  const webhookStatus = initial?.config?.telegram_webhook_status as string | undefined;
  const webhookDetail = initial?.config?.telegram_webhook_detail as string | undefined;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "telegram",
          credentials: { telegram_bot_token: botToken },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        toast.success("Bot de Telegram guardado");
        onSaved();
      } else {
        toast.error(json.error ?? "Error al guardar");
      }
    } catch {
      toast.error("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Telegram"
      description="Bot de Telegram para el canal del Chatbot. No afecta al Agente de WhatsApp."
    >
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="tg-bot-token">Token del bot</Label>
          <Input
            id="tg-bot-token"
            type="password"
            placeholder="123456:ABC-DEF..."
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Créalo con @BotFather en Telegram. El Chatbot se conecta a este
            bot desde su propia pantalla en el menú principal.
          </p>
        </div>

        {webhookStatus && (
          <p className="text-xs text-muted-foreground">
            Webhook: {webhookStatus === "registered" ? "registrado" : `error (${webhookDetail ?? "desconocido"})`}
          </p>
        )}

        <div className="pt-2">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </Section>
  );
}

// ─── HighLevel section ────────────────────────────────────────────────────────

function HighLevelSection({
  workspaceId,
  initial,
  onSaved,
}: {
  workspaceId: string;
  initial: IntegrationData | undefined;
  onSaved: () => void;
}) {
  const [pit, setPit] = useState(initial?.credentials?.highlevel_pit ?? "");
  const [locationId, setLocationId] = useState(
    (initial?.config?.location_id as string | undefined) ?? "",
  );
  const [calendarId, setCalendarId] = useState(
    (initial?.config?.calendar_id as string | undefined) ?? "",
  );
  const [pipelineId, setPipelineId] = useState(
    (initial?.config?.pipeline_id as string | undefined) ?? "",
  );
  const [stageId, setStageId] = useState(
    (initial?.config?.pipeline_stage_id as string | undefined) ?? "",
  );
  const isConnected = Boolean(
    initial?.credentials?.highlevel_pit && initial?.config?.location_id,
  );
  const [pipelines, setPipelines] = useState<HLPipelineOption[]>([]);
  // Seed the loading flag from isConnected so the mount fetch doesn't flash the
  // empty state before the effect runs.
  const [loadingPipelines, setLoadingPipelines] = useState(isConnected);
  const [pipelinesError, setPipelinesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadPipelines = useCallback(async () => {
    setLoadingPipelines(true);
    setPipelinesError(null);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/integrations/highlevel/pipelines`,
      );
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        pipelines?: HLPipelineOption[];
      };
      if (json.ok && json.pipelines) {
        setPipelines(json.pipelines);
      } else {
        setPipelinesError(json.error ?? "No se pudieron cargar los pipelines");
      }
    } catch {
      setPipelinesError("Error de red al cargar los pipelines");
    } finally {
      setLoadingPipelines(false);
    }
  }, [workspaceId]);

  // Auto-load pipelines on mount when HighLevel is already connected.
  useEffect(() => {
    if (!isConnected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: loadPipelines resets loading/error before each (re)fetch
    loadPipelines();
  }, [isConnected, loadPipelines]);

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);
  const stages = selectedPipeline?.stages ?? [];

  function handlePipelineChange(nextPipelineId: string) {
    setPipelineId(nextPipelineId);
    // Reset the stage when it doesn't belong to the newly selected pipeline.
    const next = pipelines.find((p) => p.id === nextPipelineId);
    if (!next?.stages.some((s) => s.id === stageId)) {
      setStageId(next?.stages[0]?.id ?? "");
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "highlevel",
          enabled: true,
          credentials: { highlevel_pit: pit },
          config: {
            location_id: locationId,
            calendar_id: calendarId,
            pipeline_id: pipelineId,
            pipeline_stage_id: stageId,
          },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        toast.success("Configuración de HighLevel guardada");
        onSaved();
        // Refresh pipelines in case the PIT/Location just changed.
        void loadPipelines();
      } else {
        toast.error(json.error ?? "Error al guardar");
      }
    } catch {
      toast.error("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/integrations/highlevel/test`,
        { method: "POST" },
      );
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        locationName?: string | null;
        hasCalendar?: boolean;
      };
      if (json.ok) {
        const loc = json.locationName ? ` — ${json.locationName}` : "";
        const cal = json.hasCalendar ? "" : " (falta Calendar ID para agendar)";
        toast.success(`HighLevel conectado${loc}${cal}`);
      } else {
        toast.error(json.error ?? "Error al probar la conexión");
      }
    } catch {
      toast.error("Error de red al probar la conexión");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Section
      title="HighLevel"
      description="Conecta tu CRM con un Private Integration Token (PIT). Requerido para sincronizar contactos y agendar en el calendario."
    >
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="hl-pit">Private Integration Token (PIT)</Label>
          <Input
            id="hl-pit"
            type="password"
            placeholder="pit-..."
            value={pit}
            onChange={(e) => setPit(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            GHL → Settings → Private Integrations → crea un token con permisos
            de contactos y calendarios.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hl-location">Location ID</Label>
          <Input
            id="hl-location"
            placeholder="bfilCH1kUaWjdh22WREh"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hl-calendar">Calendar ID</Label>
          <Input
            id="hl-calendar"
            placeholder="ID del calendario donde se agendan las citas"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            GHL → Calendars → el calendario → Settings. Necesario para que el
            agente reserve citas.
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <div>
            <Label>Pipeline de oportunidades (modo setter)</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Cuando un lead califica con la acción “Crear oportunidad en HL”,
              se crea en este pipeline y etapa.
            </p>
          </div>

          {loadingPipelines ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Cargando pipelines…
            </div>
          ) : pipelinesError ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{pipelinesError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadPipelines()}
              >
                Reintentar
              </Button>
            </div>
          ) : pipelines.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Guarda tu PIT y Location ID, luego carga los pipelines de tu
                cuenta de HighLevel.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadPipelines()}
              >
                Cargar pipelines
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="hl-pipeline">Pipeline</Label>
                <select
                  id="hl-pipeline"
                  value={pipelineId}
                  onChange={(e) => handlePipelineChange(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">— Selecciona un pipeline —</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hl-stage">Etapa</Label>
                <select
                  id="hl-stage"
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  disabled={!selectedPipeline}
                  className={SELECT_CLASS}
                >
                  <option value="">— Selecciona una etapa —</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing}
            aria-busy={testing}
          >
            {testing && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Probar conexión
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </Section>
  );
}

// ─── Google Calendar section ──────────────────────────────────────────────────

function GoogleCalendarSection({
  workspaceId,
  initial,
  serviceAccountEmail,
  onSaved,
}: {
  workspaceId: string;
  initial: IntegrationData | undefined;
  serviceAccountEmail: string;
  onSaved: () => void;
}) {
  const [calendarId, setCalendarId] = useState(
    (initial?.config?.calendar_id as string | undefined) ?? "",
  );
  const [timezone, setTimezone] = useState(
    (initial?.config?.timezone as string | undefined) ?? "America/Mexico_City",
  );
  const [hoursStart, setHoursStart] = useState(
    (initial?.config?.business_hours_start as number | undefined) ?? 9,
  );
  const [hoursEnd, setHoursEnd] = useState(
    (initial?.config?.business_hours_end as number | undefined) ?? 18,
  );
  const [slotMinutes, setSlotMinutes] = useState(
    (initial?.config?.slot_minutes as number | undefined) ?? 30,
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google_calendar",
          enabled: true,
          config: {
            calendar_id: calendarId,
            timezone,
            business_hours_start: hoursStart,
            business_hours_end: hoursEnd,
            slot_minutes: slotMinutes,
          },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        toast.success("Configuración de Google Calendar guardada");
        onSaved();
      } else {
        toast.error(json.error ?? "Error al guardar");
      }
    } catch {
      toast.error("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/integrations/google/test`,
        { method: "POST" },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        toast.success("Google Calendar conectado");
      } else {
        toast.error(json.error ?? "Error al probar la conexión");
      }
    } catch {
      toast.error("Error de red al probar la conexión");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Section
      title="Google Calendar"
      description="Consulta disponibilidad y agenda citas directo en un Google Calendar del cliente."
    >
      <div className="grid gap-4">
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          Pide al cliente que comparta su Google Calendar (permiso &quot;Hacer
          cambios en eventos&quot;) con:
          <div className="mt-1 flex items-center gap-2">
            <code className="font-mono text-foreground">
              {serviceAccountEmail || "(configura GOOGLE_SERVICE_ACCOUNT_EMAIL)"}
            </code>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gcal-id">Calendar ID</Label>
          <Input
            id="gcal-id"
            placeholder="cliente@gmail.com o un ID largo de calendario"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Google Calendar → Configuración del calendario → Integrar calendario
            → &quot;ID de calendario&quot;.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="gcal-tz">Zona horaria</Label>
            <Input
              id="gcal-tz"
              placeholder="America/Mexico_City"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Identificador IANA exacto, ej: <code>Europe/Madrid</code>,{" "}
              <code>America/Mexico_City</code> — no una descripción.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gcal-slot">Duración de cita (min)</Label>
            <Input
              id="gcal-slot"
              type="number"
              min={5}
              step={5}
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="gcal-start">Horario laboral desde</Label>
            <Input
              id="gcal-start"
              type="number"
              min={0}
              max={23}
              value={hoursStart}
              onChange={(e) => setHoursStart(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gcal-end">Horario laboral hasta</Label>
            <Input
              id="gcal-end"
              type="number"
              min={0}
              max={23}
              value={hoursEnd}
              onChange={(e) => setHoursEnd(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing}
            aria-busy={testing}
          >
            {testing && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Probar conexión
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </Section>
  );
}

// ─── Airtable section ─────────────────────────────────────────────────────────

function AirtableSection({
  workspaceId,
  initial,
  onSaved,
}: {
  workspaceId: string;
  initial: IntegrationData | undefined;
  onSaved: () => void;
}) {
  const [pat, setPat] = useState(initial?.credentials?.airtable_pat ?? "");
  const [baseId, setBaseId] = useState(
    (initial?.config?.base_id as string | undefined) ?? "",
  );
  const [tableName, setTableName] = useState(
    (initial?.config?.table_name as string | undefined) ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/integrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "airtable",
          enabled: true,
          credentials: { airtable_pat: pat },
          config: { base_id: baseId, table_name: tableName },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        toast.success("Configuración de Airtable guardada");
        onSaved();
      } else {
        toast.error(json.error ?? "Error al guardar");
      }
    } catch {
      toast.error("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(
        `/api/workspace/${workspaceId}/integrations/airtable/test`,
        { method: "POST" },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        toast.success("Airtable conectado");
      } else {
        toast.error(json.error ?? "Error al probar la conexión");
      }
    } catch {
      toast.error("Error de red al probar la conexión");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Section
      title="Airtable"
      description="Guarda cada contacto que escribe al bot como una fila en una tabla de Airtable del cliente."
    >
      <div className="grid gap-4">
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          En la tabla de Airtable, crea estas columnas con el nombre exacto:{" "}
          <code className="font-mono text-foreground">Nombre</code>,{" "}
          <code className="font-mono text-foreground">Teléfono</code>,{" "}
          <code className="font-mono text-foreground">Email</code>,{" "}
          <code className="font-mono text-foreground">Último mensaje</code>,{" "}
          <code className="font-mono text-foreground">Última actividad</code>.
          &quot;Teléfono&quot; es la clave: cada mensaje nuevo del mismo
          contacto actualiza su misma fila en vez de crear otra.
          <br />
          <strong className="text-foreground">
            Importante:
          </strong>{" "}
          &quot;Teléfono&quot; debe ser de tipo{" "}
          <strong className="text-foreground">
            &quot;Texto de línea única&quot;
          </strong>
          , no &quot;Número de teléfono&quot; — Airtable no permite usar ese
          tipo como clave de actualización y la sincronización fallará con un
          error 422.
          <br />
          <strong className="text-foreground">Opcional</strong> (solo si el
          agente activo es modo &quot;setter&quot; / calificación de leads):
          agrega también{" "}
          <code className="font-mono text-foreground">Sector</code>,{" "}
          <code className="font-mono text-foreground">
            Problema_principal
          </code>{" "}
          y <code className="font-mono text-foreground">Proximo_paso</code>{" "}
          (texto de línea única). Se llenan solo cuando el lead califica o
          queda descartado, no en cada mensaje.
        </div>

        <div className="space-y-2">
          <Label htmlFor="at-pat">Personal Access Token</Label>
          <Input
            id="at-pat"
            type="password"
            placeholder="pat..."
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Airtable → icono de cuenta → Developer hub → Personal access
            tokens → crea uno con permisos{" "}
            <code className="font-mono">data.records:read</code> y{" "}
            <code className="font-mono">data.records:write</code> sobre la
            base del cliente.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="at-base">Base ID</Label>
          <Input
            id="at-base"
            placeholder="appXXXXXXXXXXXXXX"
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            En la base de Airtable → Ayuda → API documentation, aparece al
            inicio como <code className="font-mono">app…</code>.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="at-table">Nombre de la tabla</Label>
          <Input
            id="at-table"
            placeholder="Contactos"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            className="font-mono text-sm"
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing}
            aria-busy={testing}
          >
            {testing && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Probar conexión
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </Section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
  initialIntegrations: unknown[];
  googleServiceAccountEmail?: string;
}

export function IntegrationsTab({
  workspaceId,
  initialIntegrations,
  googleServiceAccountEmail,
}: Props) {
  const [integrations, setIntegrations] = useState<IntegrationData[]>(
    initialIntegrations as IntegrationData[],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/integrations`);
      const json = (await res.json()) as { integrations?: IntegrationData[] };
      if (json.integrations) setIntegrations(json.integrations);
    } catch {
      // Non-critical — stale data is fine after save
    }
  }, [workspaceId]);

  const ycloud = findIntegration(integrations, "ycloud");
  const openrouter = findIntegration(integrations, "openrouter");
  const highlevel = findIntegration(integrations, "highlevel");
  const googleCalendar = findIntegration(integrations, "google_calendar");
  const airtable = findIntegration(integrations, "airtable");
  const telegram = findIntegration(integrations, "telegram");

  return (
    <div className="space-y-6">
      <YCloudSection
        workspaceId={workspaceId}
        initial={ycloud}
        onSaved={refresh}
      />
      <Separator />
      <OpenRouterSection
        workspaceId={workspaceId}
        initial={openrouter}
        onSaved={refresh}
      />
      <Separator />
      <HighLevelSection
        workspaceId={workspaceId}
        initial={highlevel}
        onSaved={refresh}
      />
      <Separator />
      <GoogleCalendarSection
        workspaceId={workspaceId}
        initial={googleCalendar}
        serviceAccountEmail={googleServiceAccountEmail ?? ""}
        onSaved={refresh}
      />
      <Separator />
      <AirtableSection
        workspaceId={workspaceId}
        initial={airtable}
        onSaved={refresh}
      />
      <Separator />
      <TelegramSection
        workspaceId={workspaceId}
        initial={telegram}
        onSaved={refresh}
      />
    </div>
  );
}
