import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../core/tool";

const schema = z.object({
  datetime_iso: z
    .string()
    .describe(
      "Inicio de la cita en ISO 8601 con zona horaria, ej: 2026-06-12T10:00:00-06:00",
    ),
  duration_minutes: z
    .number()
    .int()
    .positive()
    .max(480)
    .optional()
    .describe("Duración en minutos (usa el default del workspace si se omite)"),
  contact_name: z
    .string()
    .optional()
    .describe("Nombre del contacto para la cita"),
  contact_phone: z
    .string()
    .optional()
    .describe(
      "Teléfono del contacto en E.164 (ej: +5215512345678). Úsalo cuando el contacto no venga del chat.",
    ),
});

type Args = z.infer<typeof schema>;

async function run(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { getGoogleCalendarConfig, createGoogleEvent } = await import(
    "../../inbox/services/google-calendar-client"
  );

  const cfg = await getGoogleCalendarConfig(ctx.workspaceId);
  if (!cfg) {
    return {
      ok: false,
      output: null,
      error: "Google Calendar no está conectado para este workspace",
    };
  }

  const name = args.contact_name ?? "Contacto WhatsApp";
  const phone = args.contact_phone ?? "";

  try {
    const event = await createGoogleEvent({
      calendarId: cfg.calendarId,
      startIso: args.datetime_iso,
      durationMinutes: args.duration_minutes ?? cfg.slotMinutes,
      summary: `Cita — ${name}`,
      description: phone ? `Teléfono: ${phone}` : undefined,
    });

    return {
      ok: true,
      output: {
        event_id: event.id,
        datetime: args.datetime_iso,
        html_link: event.htmlLink,
      },
    };
  } catch (err) {
    return {
      ok: false,
      output: null,
      error:
        err instanceof Error ? err.message : "Error agendando en Google Calendar",
    };
  }
}

export const scheduleGoogleTool: Tool<Args> = {
  name: "schedule_google",
  description:
    "Reserva una cita directamente en el Google Calendar del negocio. Úsalo cuando el cliente confirme una fecha y hora específicas. Llama primero a check_availability_google para ofrecer horarios reales.",
  sensitivity: "write",
  schema,
  enabledFor: () => true,
  run,
};
