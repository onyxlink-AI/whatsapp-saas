import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { projectPublishedOfficeAgents } from '@/features/office-virtual/client/central-integrations/office-agent-projection';
import type { OfficeConfigurationDocument } from '@/features/office-virtual/client/central-integrations/configuration';
import { requireOfficeVirtualReader } from '@/features/office-virtual/server/office-virtual-access';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Read-only, sanitized roster for the live 3D office: only PUBLISHED,
// ENABLED seats, and only name/function/objective/color — never
// instructions, the client layer, or draft content. Authorized for
// superadmin and for workspace admin/manager once office_virtual_enabled is
// true (see requireOfficeVirtualReader). This is deliberately a different,
// narrower route than /configurator, which stays superadmin-exclusive.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireOfficeVirtualReader(workspaceId);
  if (!auth.ok) return auth.response;

  try {
    const { data, error } = await serviceClient()
      .from('office_virtual_configurations')
      .select('document')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return NextResponse.json({ projection: { workspaceId, officeDisplayName: 'Oficina Virtual', revision: 0, seats: [], coreSeatDisplayNames: {} } });
    }

    const document = data.document as OfficeConfigurationDocument;
    const result = projectPublishedOfficeAgents(document, workspaceId);
    if (!result.success) {
      // Not yet published, or a workspace mismatch (shouldn't happen) — an
      // honest empty roster, never a fabricated one.
      return NextResponse.json({ projection: { workspaceId, officeDisplayName: document.officeDisplayName, revision: document.revision, seats: [], coreSeatDisplayNames: {} } });
    }

    return NextResponse.json({ projection: result.projection });
  } catch (error) {
    console.error('[GET office-virtual/office-agents]', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
