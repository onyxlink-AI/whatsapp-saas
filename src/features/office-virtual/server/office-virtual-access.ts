import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireSuperAdmin, requireWorkspaceMember } from '@/lib/auth/workspace-access';
import { resolveEntitlements } from '@/features/entitlements/resolve';

type Ok = { ok: true; userId: string; isSuperAdmin: boolean };
type Fail = { ok: false; response: NextResponse };

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Read access to sanitized Oficina Virtual data (capability snapshot, the
 * published specialist roster). Superadmin always passes. Otherwise the
 * caller must be an active admin/manager member of `workspaceId` AND
 * office_virtual_enabled must be true for that workspace — the RBAC floor
 * from the product policy: "como mínimo, administradores y managers del
 * workspace deben poder entrar". Does NOT authorize writes — the
 * configurator's mutation routes stay requireSuperAdmin()-only.
 */
export async function requireOfficeVirtualReader(workspaceId: string): Promise<Ok | Fail> {
  const superAdmin = await requireSuperAdmin();
  if (superAdmin.ok) return { ok: true, userId: superAdmin.userId, isSuperAdmin: true };

  const member = await requireWorkspaceMember(workspaceId, { minRole: 'manager' });
  if (!member.ok) return member;

  const { data: workspace, error } = await serviceClient()
    .from('workspaces')
    .select('product_package')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) {
    console.error('[requireOfficeVirtualReader]', error);
    return { ok: false, response: NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 }) };
  }
  if (!resolveEntitlements(workspace).hasOfficeVirtual) {
    return { ok: false, response: NextResponse.json({ error: 'Oficina Virtual no está activada para este workspace' }, { status: 409 }) };
  }

  return { ok: true, userId: member.userId, isSuperAdmin: false };
}
