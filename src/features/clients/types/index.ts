export type ClientStatus = "activo" | "potencial" | "archivado";

export const CLIENT_STATUSES: ClientStatus[] = ["activo", "potencial", "archivado"];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  activo: "Activo",
  potencial: "Potencial",
  archivado: "Archivado",
};

export interface CompanyRow {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
}

export interface ClientRow {
  id: string;
  workspace_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company_id: string | null;
  company: CompanyRow | null;
  client_status: ClientStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
