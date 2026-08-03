import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  createClientRecord,
  updateClientRecord,
  listClients,
} from "@/features/clients/services/client-actions";
import { logAudit } from "@/features/audit/services/audit-log";
import type { HelpActionContext } from "../../types";

/**
 * Action tools for the Clientes module — thin wrappers around the exact same
 * server functions the UI itself calls (client-actions.ts), so all existing
 * business rules (phone-uniqueness handling, findOrCreateCompanyId dedupe,
 * RLS-based role permissions via the request-scoped Supabase client) apply
 * unchanged. No delete tool exists here on purpose — see the plan doc.
 */

const SearchClientsSchema = z.object({
  query: z.string().min(1).describe("Nombre, teléfono o empresa a buscar"),
});

const CreateClientSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  social_media: z.string().optional().describe("Red social del cliente (ej. Instagram), opcional"),
  contact_method: z.string().optional().describe("Método de contacto preferido, opcional"),
  company_name: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateClientSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  social_media: z.string().optional(),
  contact_method: z.string().optional(),
  company_name: z.string().optional(),
  client_status: z.enum(["activo", "potencial", "archivado"]).optional(),
  notes: z.string().optional(),
});

export function buildClientTools(ctx: HelpActionContext) {
  return {
    search_clients: tool({
      description:
        "Busca clientes existentes por nombre, teléfono o empresa. Úsalo antes de crear un cliente (para evitar duplicados) o antes de editar uno (para obtener su client_id).",
      inputSchema: zodSchema(SearchClientsSchema),
      execute: async ({ query }: z.infer<typeof SearchClientsSchema>) => {
        const results = await listClients(ctx.workspaceId, { search: query });
        return results.slice(0, 10).map((c) => ({
          client_id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          status: c.client_status,
        }));
      },
    }),

    create_client: tool({
      description:
        "Crea un cliente nuevo en Clientes. Requiere solo el nombre — teléfono, correo, red social y método de contacto son todos opcionales, usa los que el usuario te dé (pregunta por ellos si quieres que el cliente quede más completo, pero no los exijas).",
      inputSchema: zodSchema(CreateClientSchema),
      execute: async (args: z.infer<typeof CreateClientSchema>) => {
        const result = await createClientRecord(ctx.workspaceId, {
          name: args.name,
          phone: args.phone ?? "",
          email: args.email ?? "",
          social_media: args.social_media ?? "",
          contact_method: args.contact_method ?? "",
          company_name: args.company_name ?? "",
          notes: args.notes ?? "",
        });

        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.create_client",
          targetType: "contact",
          targetId: result.data.id,
          summary: `Asistente de Ayuda creó el cliente "${args.name}"`,
        });

        return { ok: true, client_id: result.data.id };
      },
    }),

    update_client: tool({
      description:
        "Actualiza un cliente existente. Necesitas su client_id (búscalo antes con search_clients si no lo tienes). Este endpoint reemplaza todos los campos a la vez — incluye siempre el nombre y demás datos ACTUALES del cliente (los que te devolvió search_clients), no solo lo que quieres cambiar.",
      inputSchema: zodSchema(UpdateClientSchema),
      execute: async (args: z.infer<typeof UpdateClientSchema>) => {
        const result = await updateClientRecord(args.client_id, {
          name: args.name,
          phone: args.phone ?? "",
          email: args.email ?? "",
          social_media: args.social_media ?? "",
          contact_method: args.contact_method ?? "",
          company_name: args.company_name ?? "",
          client_status: args.client_status,
          notes: args.notes ?? "",
        });

        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_client",
          targetType: "contact",
          targetId: args.client_id,
          summary: `Asistente de Ayuda actualizó el cliente "${args.name}"`,
        });

        return { ok: true, client_id: result.data.id };
      },
    }),
  };
}
