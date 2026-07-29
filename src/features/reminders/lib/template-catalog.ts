// Sector template catalog — pure data, no DB. "Installing" a template just
// copies these step definitions into that workspace's own editable
// `reminder_steps` rows (see reminder-config.ts); nothing here is read at
// send time. Adding a new sector template later means adding one more entry
// to this array — the engine itself (scheduling, jobs, sender) is generic.

export type ReminderConsentCategory =
  | "appointment_reminders"
  | "aftercare_followup"
  | "review_request";

export interface ReminderTemplateStepDef {
  stepKey: string;
  name: string;
  position: number;
  /** Minutes relative to the appointment; negative = before, positive = after. */
  offsetMinutes: number;
  messageBase: string;
  allowAiPersonalize: boolean;
  requiresConsent: boolean;
  collectsResponse: boolean;
  /** Which consent category a contact must have explicitly granted before this step can ever send for real. */
  category: ReminderConsentCategory;
}

export interface ReminderTemplateDef {
  key: string;
  label: string;
  description: string;
  steps: ReminderTemplateStepDef[];
}

export const TATTOO_STUDIO_TEMPLATE: ReminderTemplateDef = {
  key: "tattoo_studio",
  label: "Estudio de tatuajes",
  description:
    "Recordatorio de cita, cuidados posteriores, seguimiento de evolución a los 10 días y revisión final.",
  steps: [
    {
      stepKey: "reminder_24h",
      name: "Recordatorio de cita (24h antes)",
      position: 0,
      offsetMinutes: -24 * 60,
      messageBase:
        "Hola, {{nombre}} 👋 Te recordamos que mañana tienes tu cita en {{empresa}} a las {{hora}} con {{profesional}}. ¿Nos confirmas que podrás venir?",
      allowAiPersonalize: true,
      requiresConsent: false,
      collectsResponse: true,
      category: "appointment_reminders",
    },
    {
      stepKey: "aftercare",
      name: "Cuidados posteriores",
      position: 1,
      offsetMinutes: 24 * 60,
      messageBase:
        "Hola, {{nombre}} 👋 Gracias por tu visita a {{empresa}}. Aquí tienes los cuidados que debes seguir para tu tatuaje: (el estudio debe completar este texto con sus instrucciones aprobadas).",
      allowAiPersonalize: false,
      requiresConsent: false,
      collectsResponse: false,
      category: "aftercare_followup",
    },
    {
      stepKey: "progress_10d",
      name: "Seguimiento de evolución (10 días)",
      position: 2,
      offsetMinutes: 10 * 24 * 60,
      messageBase:
        "Hola, {{nombre}} 👋 Han pasado 10 días desde tu sesión. ¿Cómo está evolucionando tu tatuaje? Cuéntame cómo lo ves y avisaré al equipo si necesitas ayuda.",
      allowAiPersonalize: true,
      requiresConsent: false,
      collectsResponse: true,
      category: "aftercare_followup",
    },
    {
      stepKey: "final_review",
      name: "Revisión final (28 días)",
      position: 3,
      offsetMinutes: 28 * 24 * 60,
      messageBase:
        "Hola, {{nombre}} 👋 ¿Cómo quedó finalmente tu tatuaje? Si quieres, podemos agendar una revisión o retoque — cuéntame cómo lo ves.",
      allowAiPersonalize: true,
      requiresConsent: true,
      collectsResponse: true,
      category: "review_request",
    },
  ],
};

export const REMINDER_TEMPLATES: ReminderTemplateDef[] = [TATTOO_STUDIO_TEMPLATE];

export function findReminderTemplate(key: string): ReminderTemplateDef | null {
  return REMINDER_TEMPLATES.find((t) => t.key === key) ?? null;
}
