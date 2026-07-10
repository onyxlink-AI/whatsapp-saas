import { createClient as createSbClient } from "@supabase/supabase-js";

// contact-memory.ts — Memoria Inteligente Avanzada (Fase 1): lectura de la
// memoria persistente de un contacto y su formateo como bloque de prompt.
// Dormant a menos que workspaces.advanced_memory_enabled sea true — ver
// isAdvancedMemoryEnabled(), consultado desde buffer.ts antes de llamar a
// cualquier función de este módulo.

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface ContactMemory {
  id: string;
  workspace_id: string;
  contact_id: string;
  summary: string | null;
  interests: string[];
  preferences: Record<string, unknown>;
  objections: string[];
  lead_status: string | null;
  next_step: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function isAdvancedMemoryEnabled(
  workspaceId: string,
): Promise<boolean> {
  const supabase = svc();
  const { data } = await supabase
    .from("workspaces")
    .select("advanced_memory_enabled")
    .eq("id", workspaceId)
    .maybeSingle();
  return data?.advanced_memory_enabled === true;
}

export async function getContactMemory(
  contactId: string,
): Promise<ContactMemory | null> {
  const supabase = svc();
  const { data } = await supabase
    .from("contact_memories")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();
  return (data as ContactMemory | null) ?? null;
}

export function formatMemoryContext(
  memory: ContactMemory | null | undefined,
): string {
  if (!memory) return "";

  const lines: string[] = [];
  if (memory.summary?.trim()) lines.push(`Resumen: ${memory.summary.trim()}`);
  if (memory.interests.length > 0)
    lines.push(`Intereses: ${memory.interests.join(", ")}`);
  if (Object.keys(memory.preferences).length > 0)
    lines.push(
      `Preferencias: ${Object.entries(memory.preferences)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}`,
    );
  if (memory.objections.length > 0)
    lines.push(`Objeciones previas: ${memory.objections.join(", ")}`);
  if (memory.lead_status?.trim())
    lines.push(`Estado del lead: ${memory.lead_status.trim()}`);
  if (memory.next_step?.trim())
    lines.push(`Siguiente paso sugerido: ${memory.next_step.trim()}`);

  if (lines.length === 0) return "";

  return `## Memoria del contacto\n${lines.join("\n")}`;
}
