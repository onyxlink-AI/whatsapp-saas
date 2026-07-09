import { NextRequest, NextResponse } from "next/server";
import { testAirtableConnection } from "@/features/inbox/services/airtable-client";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import { decryptCredentials } from "@/shared/lib/crypto";
import { createClient as svcClient } from "@supabase/supabase-js";

// POST /api/workspace/[id]/integrations/airtable/test
// Verifies the saved Base ID / Table Name / PAT can reach the table.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const svc = svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await svc
    .from("integrations")
    .select("config, credentials")
    .eq("workspace_id", workspaceId)
    .eq("provider", "airtable")
    .maybeSingle();

  const baseId = (data?.config as { base_id?: string } | null)?.base_id;
  const tableName = (data?.config as { table_name?: string } | null)
    ?.table_name;

  if (!baseId || !tableName) {
    return NextResponse.json({
      ok: false,
      error: "Falta el Base ID o el nombre de la tabla",
    });
  }

  const creds = await decryptCredentials(
    data?.credentials as Record<string, unknown> | null,
  );
  const pat = creds.airtable_pat;
  if (typeof pat !== "string" || pat.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "Falta el Personal Access Token",
    });
  }

  const result = await testAirtableConnection({ baseId, tableName, pat });
  return NextResponse.json(result);
}
