"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, CheckCircle2, ChevronDown, Clock3, PauseCircle, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Appointment = {
  id: string;
  scheduled_at: string;
  status: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
};

type ConsentCategory = "appointment_reminders" | "aftercare_followup" | "review_request";
type Consent = { category: ConsentCategory; status: "granted" | "withdrawn" };

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Programada",
  confirmed: "Confirmada",
  completed: "Completada",
  no_show: "No se presentó",
  cancelled: "Cancelada",
};

const CONSENT_LABELS: Record<ConsentCategory, { title: string; description: string }> = {
  appointment_reminders: { title: "Recordatorios de la cita", description: "Avisos previos para reducir olvidos." },
  aftercare_followup: { title: "Seguimiento posterior", description: "Preguntar cómo evoluciona después del servicio." },
  review_request: { title: "Solicitud de reseña", description: "Pedir una valoración al finalizar." },
};

const CATEGORIES = Object.keys(CONSENT_LABELS) as ConsentCategory[];

function localDateTime(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function ContactSafetyControls({ workspaceId, contactId }: { workspaceId: string; contactId: string }) {
  const [consents, setConsents] = useState<Consent[] | null>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ contactId });
    const [consentResponse, pauseResponse] = await Promise.all([
      fetch(`/api/workspace/${workspaceId}/reminders/consent?${query}`),
      fetch(`/api/workspace/${workspaceId}/reminders/contact-pause?${query}`),
    ]);
    const consentJson = await consentResponse.json() as { consents?: Consent[] };
    const pauseJson = await pauseResponse.json() as { paused?: boolean };
    setConsents(consentJson.consents ?? []);
    setPaused(Boolean(pauseJson.paused));
  }, [contactId, workspaceId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial API hydration follows the established settings-panel pattern.
  useEffect(() => { void load(); }, [load]);

  const setContactPause = async (action: "pause" | "resume") => {
    setBusy(true);
    try {
      const response = await fetch(`/api/workspace/${workspaceId}/reminders/contact-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, action, reason: action === "pause" ? "Pausado desde el panel" : undefined }),
      });
      const json = await response.json() as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "No se pudo actualizar el seguimiento");
      setPaused(action === "pause");
      toast.success(action === "pause" ? "Seguimiento pausado para este cliente" : "Seguimiento reanudado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el seguimiento");
    } finally {
      setBusy(false);
    }
  };

  const setConsent = async (category: ConsentCategory, action: "grant" | "withdraw") => {
    setBusy(true);
    try {
      const response = await fetch(`/api/workspace/${workspaceId}/reminders/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, category, action, method: "manual_staff" }),
      });
      const json = await response.json() as { consent?: Consent; error?: string };
      if (!response.ok || !json.consent) throw new Error(json.error ?? "No se pudo actualizar el consentimiento");
      setConsents((current) => [...(current ?? []).filter((item) => item.category !== category), json.consent!]);
      toast.success(action === "grant" ? "Consentimiento registrado" : "Consentimiento retirado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el consentimiento");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 p-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-foreground"><PauseCircle className="h-3.5 w-3.5" /> Seguimiento de este cliente</div>
          <p className="mt-1 text-[11px] text-muted-foreground">La pausa afecta a todas sus citas y se puede deshacer.</p>
        </div>
        <Button size="sm" variant={paused ? "default" : "outline"} disabled={busy || paused === null} onClick={() => void setContactPause(paused ? "resume" : "pause")}>
          {paused ? "Reanudar seguimiento" : "Pausar seguimiento"}
        </Button>
      </div>

      <div className="rounded-lg border border-border/50 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Permisos de comunicación</div>
        <p className="mt-1 text-[11px] text-muted-foreground">Cada tipo de mensaje necesita su propio consentimiento explícito.</p>
        <div className="mt-3 space-y-2">
          {CATEGORIES.map((category) => {
            const granted = consents?.find((item) => item.category === category)?.status === "granted";
            return (
              <div key={category} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/40 px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-foreground">{CONSENT_LABELS[category].title}</div>
                  <div className="text-[11px] text-muted-foreground">{CONSENT_LABELS[category].description}</div>
                </div>
                <Button size="sm" variant={granted ? "outline" : "default"} disabled={busy || consents === null} onClick={() => void setConsent(category, granted ? "withdraw" : "grant")}>
                  {granted ? "Retirar permiso" : "Registrar permiso"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AppointmentOperationsPanel({ workspaceId }: { workspaceId: string }) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [form, setForm] = useState({ contactName: "", contactPhone: "", scheduledAt: "", professionalName: "", source: "manual" });

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspace/${workspaceId}/reminders/appointments`);
      const json = await response.json() as { appointments?: Appointment[]; error?: string };
      if (!response.ok) throw new Error(json.error ?? "No se pudieron cargar las citas");
      setAppointments(json.appointments ?? []);
      setError(null);
    } catch (loadError) {
      setAppointments([]);
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las citas");
    }
  }, [workspaceId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial API hydration follows the established settings-panel pattern.
  useEffect(() => { void load(); }, [load]);

  const createAppointment = async () => {
    if (!form.contactPhone.trim() || !form.scheduledAt) {
      toast.error("Añade el teléfono y la fecha de la cita");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/workspace/${workspaceId}/reminders/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactPhone: form.contactPhone,
          contactName: form.contactName || undefined,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          professionalName: form.professionalName || undefined,
          source: form.source,
        }),
      });
      const json = await response.json() as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "No se pudo registrar la cita");
      toast.success("Cita registrada y secuencia preparada");
      setForm({ contactName: "", contactPhone: "", scheduledAt: "", professionalName: "", source: "manual" });
      setShowCreate(false);
      await load();
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : "No se pudo registrar la cita");
    } finally {
      setBusy(false);
    }
  };

  const updateAppointment = async (appointmentId: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/workspace/${workspaceId}/reminders/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json() as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "No se pudo actualizar la cita");
      toast.success("Cita actualizada");
      setRescheduleAt("");
      await load();
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "No se pudo actualizar la cita");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><CalendarPlus className="h-4 w-4 text-primary" /> Citas y clientes en seguimiento</div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">Registra citas que llegaron por recepción u otro canal y controla su seguimiento sin tocar el calendario externo.</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((current) => !current)}><CalendarPlus className="h-3.5 w-3.5" /> Registrar cita</Button>
      </div>

      {showCreate && (
        <div className="grid gap-3 rounded-lg border border-primary/20 bg-primary/[0.035] p-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs">Nombre del cliente</Label><Input value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} placeholder="Nombre y apellidos" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Teléfono de WhatsApp *</Label><Input value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} placeholder="+34 600 000 000" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Fecha y hora *</Label><Input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Profesional asignado</Label><Input value={form.professionalName} onChange={(event) => setForm((current) => ({ ...current, professionalName: event.target.value }))} placeholder="Ej: Laura" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Origen</Label><Select value={form.source} onValueChange={(value) => setForm((current) => ({ ...current, source: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Recepción u otro canal</SelectItem><SelectItem value="google_calendar">Google Calendar</SelectItem><SelectItem value="highlevel">HighLevel</SelectItem></SelectContent></Select></div>
          <div className="flex items-end justify-end gap-2"><Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button><Button disabled={busy} onClick={() => void createAppointment()}>Guardar cita</Button></div>
        </div>
      )}

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}

      {!appointments ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Cargando citas…</div>
      ) : appointments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 py-8 text-center"><Clock3 className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs font-medium text-foreground">Todavía no hay citas en seguimiento</p><p className="mt-1 text-[11px] text-muted-foreground">Las citas creadas por el agente o registradas manualmente aparecerán aquí.</p></div>
      ) : (
        <div className="space-y-2">
          {appointments.map((appointment) => {
            const expanded = expandedId === appointment.id;
            return (
              <article key={appointment.id} className="rounded-lg border border-border/55 bg-background/35">
                <button className="flex w-full items-center gap-3 p-3 text-left" onClick={() => { setExpandedId(expanded ? null : appointment.id); setRescheduleAt(localDateTime(appointment.scheduled_at)); }}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/[0.05] text-primary"><UserRound className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-foreground">{appointment.contact_name ?? appointment.contact_phone ?? "Cliente"}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{new Date(appointment.scheduled_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</span></span>
                  <Badge variant="outline">{STATUS_LABELS[appointment.status] ?? appointment.status}</Badge>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>

                {expanded && (
                  <div className="border-t border-border/50 p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[13rem] flex-1 space-y-1"><Label className="text-[11px]">Nueva fecha y hora</Label><Input type="datetime-local" value={rescheduleAt} onChange={(event) => setRescheduleAt(event.target.value)} /></div>
                      <Button size="sm" variant="outline" disabled={busy || !rescheduleAt} onClick={() => void updateAppointment(appointment.id, { action: "reschedule", newScheduledAt: new Date(rescheduleAt).toISOString() })}>Reprogramar</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateAppointment(appointment.id, { action: "complete" })}><CheckCircle2 className="h-3.5 w-3.5" /> Marcar completada</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateAppointment(appointment.id, { action: "pause" })}>Pausar esta cita</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm("¿Marcar que el cliente no se presentó?")) void updateAppointment(appointment.id, { action: "no_show" }); }}>No se presentó</Button>
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm("¿Cancelar esta cita y sus mensajes pendientes?")) void updateAppointment(appointment.id, { action: "cancel", reason: "cita_cancelada" }); }}>Cancelar cita</Button>
                    </div>
                    {appointment.contact_id && <ContactSafetyControls workspaceId={workspaceId} contactId={appointment.contact_id} />}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
