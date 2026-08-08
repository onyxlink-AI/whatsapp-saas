// office-virtual-summary.ts — resumen ligero para el bloque Suite del
// dashboard (§4.4): solo el conteo de especialistas configurados/publicados,
// nunca carga la escena 3D ni el runtime de Three.js. office_virtual_configurations
// no tiene ninguna policy de RLS para anon/authenticated (ver
// 20260722000000_office_virtual_configuration.sql) — service role, como el
// resto de dashboard/services/metrics.ts, y de solo lectura: nunca
// aprovisiona un documento nuevo (a diferencia de
// loadOrProvisionOfficeConfiguration, pensado para el configurador).

import { createClient as createSbClient } from "@supabase/supabase-js";
import { projectPublishedOfficeAgents } from "@/features/office-virtual/client/central-integrations/office-agent-projection";
import type { OfficeConfigurationDocument } from "@/features/office-virtual/client/central-integrations/configuration";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface OfficeVirtualDashboardSummary {
  configuredCount: number;
}

export async function getOfficeVirtualDashboardSummary(workspaceId: string): Promise<OfficeVirtualDashboardSummary> {
  const { data } = await svc()
    .from("office_virtual_configurations")
    .select("document")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!data) return { configuredCount: 0 };

  const result = projectPublishedOfficeAgents(data.document as OfficeConfigurationDocument, workspaceId);
  return { configuredCount: result.success ? result.projection.seats.length : 0 };
}
