import { createClient as createSbClient } from "@supabase/supabase-js";
import { findReminderTemplate } from "../lib/template-catalog";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface ReminderConfigRow {
  id: string;
  workspace_id: string;
  enabled: boolean;
  template_key: string;
  template_version: number;
  appointment_source: "google_calendar" | "highlevel" | null;
  timezone: string;
  send_window_start_minute: number;
  send_window_end_minute: number;
  allow_ai_personalization: boolean;
  sensitive_keywords: string[];
  sensitive_response_message: string | null;
  continue_after_no_show: boolean;
  /** Workspace-wide emergency pause — set together with cancelling every pending job. */
  paused_at: string | null;
  paused_reason: string | null;
  max_messages_per_contact_per_day: number;
  min_minutes_between_messages: number;
  created_at: string;
  updated_at: string;
}

export interface ReminderStepRow {
  id: string;
  workspace_id: string;
  step_key: string;
  name: string;
  enabled: boolean;
  position: number;
  offset_minutes: number;
  message_base: string;
  allow_ai_personalize: boolean;
  requires_consent: boolean;
  collects_response: boolean;
  category: "appointment_reminders" | "aftercare_followup" | "review_request";
  created_at: string;
  updated_at: string;
}

const DEFAULT_SENSITIVE_KEYWORDS = [
  "dolor intenso",
  "mucho dolor",
  "pus",
  "fiebre",
  "hinchado",
  "hinchazon",
  "inflamado",
  "inflamacion",
  "sangrado",
  "sangra mucho",
  "infectado",
  "infeccion",
  "reaccion alergica",
  "no puedo respirar",
];

const DEFAULT_SENSITIVE_RESPONSE =
  "Gracias por contarnos cómo te sientes. No puedo darte un diagnóstico, pero para estar seguros vamos a avisar directamente al equipo para que te revise cuanto antes. Si el malestar es muy fuerte, por favor acude a un centro médico.";

/**
 * Ensures a workspace has a `reminder_configs` row (idempotent). The GET
 * .../reminders/config route calls this concurrently in a Promise.all
 * alongside getReminderReadiness (which also calls it internally) — the
 * very first request for a brand-new workspace can race two inserts for the
 * same workspace_id, so this uses upsert+ignoreDuplicates instead of a plain
 * select-then-insert to stay correct under that concurrency instead of
 * throwing a duplicate-key error.
 */
export async function getOrCreateReminderConfig(
  workspaceId: string,
): Promise<ReminderConfigRow> {
  const db = svc();
  const { data: existing } = await db
    .from("reminder_configs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (existing) return existing as ReminderConfigRow;

  const { data: created, error } = await db
    .from("reminder_configs")
    .upsert(
      {
        workspace_id: workspaceId,
        sensitive_keywords: DEFAULT_SENSITIVE_KEYWORDS,
        sensitive_response_message: DEFAULT_SENSITIVE_RESPONSE,
      },
      { onConflict: "workspace_id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();

  if (created) return created as ReminderConfigRow;

  // ignoreDuplicates means a concurrent insert winning the race returns no
  // row/error here rather than throwing — fetch whichever row now exists.
  const { data: refetched, error: refetchError } = await db
    .from("reminder_configs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (refetchError || !refetched) {
    throw new Error(
      `No se pudo crear la configuración: ${error?.message ?? refetchError?.message}`,
    );
  }
  return refetched as ReminderConfigRow;
}

export async function getReminderSteps(
  workspaceId: string,
): Promise<ReminderStepRow[]> {
  const db = svc();
  const { data } = await db
    .from("reminder_steps")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });
  return (data as ReminderStepRow[] | null) ?? [];
}

export interface ReminderConfigUpdate {
  enabled?: boolean;
  appointment_source?: "google_calendar" | "highlevel" | null;
  timezone?: string;
  send_window_start_minute?: number;
  send_window_end_minute?: number;
  allow_ai_personalization?: boolean;
  sensitive_keywords?: string[];
  sensitive_response_message?: string;
  continue_after_no_show?: boolean;
  max_messages_per_contact_per_day?: number;
  min_minutes_between_messages?: number;
}

export async function updateReminderConfig(
  workspaceId: string,
  patch: ReminderConfigUpdate,
): Promise<ReminderConfigRow> {
  await getOrCreateReminderConfig(workspaceId); // ensure row exists
  const db = svc();
  const { data, error } = await db
    .from("reminder_configs")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`No se pudo actualizar la configuración: ${error?.message}`);
  }
  return data as ReminderConfigRow;
}

export interface ReminderStepUpdate {
  enabled?: boolean;
  offset_minutes?: number;
  message_base?: string;
  allow_ai_personalize?: boolean;
  requires_consent?: boolean;
  position?: number;
}

export async function updateReminderStep(
  workspaceId: string,
  stepId: string,
  patch: ReminderStepUpdate,
): Promise<ReminderStepRow> {
  const db = svc();
  const { data, error } = await db
    .from("reminder_steps")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("id", stepId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`No se pudo actualizar el paso: ${error?.message}`);
  }
  return data as ReminderStepRow;
}

/**
 * Installs a catalog template's steps for a workspace: inserts any step
 * whose `step_key` doesn't already exist yet (never overwrites an already
 * customized step — installing twice, or switching template and back, is
 * always safe). Bumps `template_key`/`template_version` on the config row.
 */
export async function installReminderTemplate(
  workspaceId: string,
  templateKey: string,
): Promise<{ config: ReminderConfigRow; steps: ReminderStepRow[] }> {
  const template = findReminderTemplate(templateKey);
  if (!template) {
    throw new Error(`Plantilla desconocida: ${templateKey}`);
  }

  const db = svc();
  await getOrCreateReminderConfig(workspaceId);

  const existingSteps = await getReminderSteps(workspaceId);
  const existingKeys = new Set(existingSteps.map((s) => s.step_key));

  const toInsert = template.steps
    .filter((s) => !existingKeys.has(s.stepKey))
    .map((s) => ({
      workspace_id: workspaceId,
      step_key: s.stepKey,
      name: s.name,
      position: s.position,
      offset_minutes: s.offsetMinutes,
      message_base: s.messageBase,
      allow_ai_personalize: s.allowAiPersonalize,
      requires_consent: s.requiresConsent,
      collects_response: s.collectsResponse,
      category: s.category,
    }));

  if (toInsert.length > 0) {
    const { error: insertError } = await db.from("reminder_steps").insert(toInsert);
    if (insertError) {
      throw new Error(`No se pudieron instalar los pasos: ${insertError.message}`);
    }
  }

  const { data: config, error: configError } = await db
    .from("reminder_configs")
    .update({ template_key: templateKey })
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();

  if (configError || !config) {
    throw new Error(`No se pudo activar la plantilla: ${configError?.message}`);
  }

  return {
    config: config as ReminderConfigRow,
    steps: await getReminderSteps(workspaceId),
  };
}
