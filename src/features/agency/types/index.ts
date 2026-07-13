export interface WorkspaceWithStats {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  member_count: number;
  conversation_count: number;
  ycloud_connected: boolean;
  /** LLM tokens consumed today (UTC calendar day), from events.type=llm_usage */
  tokens_today: number;
  /** LLM tokens consumed in the last 30 days */
  tokens_30d: number;
  /** true when a cost_alert event fired for this workspace in the last 30 days */
  has_recent_cost_alert: boolean;
}

export type UseCase = "setter" | "soporte" | "agendamiento" | "general";

export interface CreateWorkspaceInput {
  name: string;
  useCase: UseCase;
  /** WhatsApp agent platform: Inbox/Agentes, Pipeline, Asistente AI. */
  whatsappAgentEnabled: boolean;
  /** "Onyxlink Gestión": Clientes/Agenda/Proyectos — always a separate add-on, never implied by the agent. */
  gestionEnabled: boolean;
  clientEmail?: string;
  /** Optional password for the client account; auto-generated if omitted. */
  clientPassword?: string;
}

/** Login credentials to hand to the client (agency-managed accounts, no email). */
export interface ClientCredentials {
  email: string;
  password: string;
}

export type CreateWorkspaceResult =
  | {
      workspaceId: string;
      webhookUrl: string;
      clientCredentials?: ClientCredentials | null;
      error?: never;
    }
  | {
      workspaceId?: never;
      webhookUrl?: never;
      clientCredentials?: never;
      error: string;
    };

export type GetWorkspacesResult =
  | { workspaces: WorkspaceWithStats[]; error?: never }
  | { workspaces?: never; error: string };
