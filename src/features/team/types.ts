export type WorkspaceRole = "admin" | "manager" | "agent" | "viewer";

export interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: WorkspaceRole;
  is_active: boolean;
  created_at: string;
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  admin: "Admin",
  manager: "Manager",
  agent: "Agente",
  viewer: "Solo ver",
};
