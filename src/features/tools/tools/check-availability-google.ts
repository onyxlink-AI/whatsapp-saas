import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../core/tool";

const schema = z.object({
  date_from: z
    .string()
    .describe("Fecha inicial del rango a consultar (ISO, ej: 2026-06-12)"),
  date_to: z.string().describe("Fecha final del rango (ISO, ej: 2026-06-19)"),
});

type Args = z.infer<typeof schema>;

async function run(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { getGoogleCalendarConfig, getFreeSlotsGoogle } = await import(
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

  try {
    const slots = await getFreeSlotsGoogle(cfg, args.date_from, args.date_to);
    return {
      ok: true,
      output: {
        slots,
        count: slots.length,
        message:
          slots.length === 0
            ? "No hay horarios disponibles en ese rango."
            : `Hay ${slots.length} horarios disponibles.`,
      },
    };
  } catch (err) {
    return {
      ok: false,
      output: null,
      error: err instanceof Error ? err.message : "Error consultando Google Calendar",
    };
  }
}

export const checkAvailabilityGoogleTool: Tool<Args> = {
  name: "check_availability_google",
  description:
    "Consulta los horarios libres reales del Google Calendar del negocio en un rango de fechas. Úsalo ANTES de agendar para ofrecer al cliente horarios que sí existen.",
  sensitivity: "read",
  simulationMessage:
    "Esta acción requiere conectar Google Calendar para consultar la disponibilidad real.",
  schema,
  enabledFor: () => true,
  run,
};
