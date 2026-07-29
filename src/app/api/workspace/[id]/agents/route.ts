import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import { listAgents } from "@/features/agents/services/agent-queries";
import { logAudit } from "@/features/audit/services/audit-log";

// GET  /api/workspace/[id]/agents          → list the workspace's agents
// PATCH /api/workspace/[id]/agents         → update fields and/or set active
//
// Reads & field-updates go through the user-context client so RLS enforces
// membership (read) and admin/manager (write). Setting the active agent uses the
// service-role-only set_active_agent RPC (atomic, respects the partial unique
// index), gated by an explicit admin/manager check.

const AVATAR_KEY = z.string().min(1).max(40);
const MODEL = z.string().min(1).max(120).nullable();

const CreateSchema = z.object({
  type: z.enum(["setter", "soporte", "agendamiento"]),
  name: z.string().trim().min(1).max(60),
  avatarKey: AVATAR_KEY.optional(),
  model: MODEL.optional(),
});

const STARTER_PROMPTS = {
  setter: "Eres {{agent_name}}, agente comercial de {{business_name}}. Tu objetivo es entender la necesidad, calificar la oportunidad y ayudar a avanzar al siguiente paso. Sé amable, profesional y directo. No inventes información y pide ayuda humana cuando sea necesario.",
  soporte: "Eres {{agent_name}}, agente de atención de {{business_name}}. Resuelve dudas con precisión y empatía usando únicamente información autorizada. Si no puedes resolver algo, explícalo y ofrece escalar con una persona.",
  agendamiento: "Eres {{agent_name}}, asistente de citas de {{business_name}}. Ayuda a consultar disponibilidad, recopilar los datos necesarios y confirmar la reserva. No confirmes una cita si la herramienta de agenda no devuelve una confirmación real.",
} as const;

const PatchSchema = z
  .object({
    agentId: z.string().uuid(),
    name: z.string().min(1).max(60).optional(),
    avatarKey: AVATAR_KEY.optional(),
    model: MODEL.optional(),
    type: z.enum(["setter", "soporte", "agendamiento"]).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    promptId: z.string().uuid().optional(),
    setActive: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.avatarKey !== undefined ||
      v.model !== undefined ||
      v.type !== undefined ||
      v.config !== undefined ||
      v.promptId !== undefined ||
      v.setActive === true,
    { message: "Nada que actualizar" },
  );

function svc() {
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id: workspaceId } = await params;

  try {
    // RLS scopes this to workspaces the user belongs to.
    const agents = await listAgents(supabase, workspaceId);
    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: workspaceId } = await params;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  // YCloud is deliberately not checked here: an agent must be creatable and
  // testable before WhatsApp is connected. Live activation remains separate.
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "manager") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const db = svc();
  const { count, error: countError } = await db
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if ((count ?? 0) >= 12) {
    return NextResponse.json(
      { error: "Puedes guardar un máximo de 12 agentes en esta empresa" },
      { status: 409 },
    );
  }

  const agentId = randomUUID();
  const promptId = randomUUID();
  const versionId = randomUUID();
  const now = new Date().toISOString();
  const { type, name, avatarKey, model } = parsed.data;

  const { error: promptError } = await db.from("prompts").insert({
    id: promptId,
    workspace_id: workspaceId,
    scope: "mode",
    scope_ref: `agent:${agentId}`,
    name: `Agente ${name}`,
  });
  if (promptError) {
    return NextResponse.json({ error: promptError.message }, { status: 500 });
  }

  const { error: versionError } = await db.from("prompt_versions").insert({
    id: versionId,
    workspace_id: workspaceId,
    prompt_id: promptId,
    version: 1,
    state: "published",
    body: STARTER_PROMPTS[type],
    created_by: user.id,
    published_at: now,
  });
  if (versionError) {
    await db.from("prompts").delete().eq("id", promptId);
    return NextResponse.json({ error: versionError.message }, { status: 500 });
  }

  const { error: activatePromptError } = await db
    .from("prompts")
    .update({ active_version_id: versionId })
    .eq("id", promptId);
  if (activatePromptError) {
    await db.from("prompts").delete().eq("id", promptId);
    return NextResponse.json(
      { error: activatePromptError.message },
      { status: 500 },
    );
  }

  const { error: agentError } = await db.from("agents").insert({
    id: agentId,
    workspace_id: workspaceId,
    type,
    name,
    avatar_key: avatarKey ?? type,
    model: model ?? null,
    is_active: false,
    prompt_id: promptId,
    config: {
      responseStyle: "balanced",
      sleepOnManualMessage: true,
    },
  });
  if (agentError) {
    await db.from("prompts").delete().eq("id", promptId);
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }

  void logAudit({
    workspaceId,
    actorUserId: user.id,
    action: "agent.create",
    targetType: "agent",
    targetId: agentId,
    summary: `Creó el agente ${name} (${type})`,
    metadata: { type },
  });

  try {
    const agents = await listAgents(db, workspaceId);
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ agent }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id: workspaceId } = await params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const { agentId, setActive, ...fields } = parsed.data;

  // Look up the agent's current name/type once, for readable audit summaries below.
  const { data: agentBefore } = await supabase
    .from("agents")
    .select("name, type")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const agentLabel = agentBefore
    ? `${agentBefore.name} (${agentBefore.type})`
    : "agente";

  // Field updates: RLS enforces admin/manager + workspace membership.
  const updates: Record<string, unknown> = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.avatarKey !== undefined) updates.avatar_key = fields.avatarKey;
  if (fields.model !== undefined) updates.model = fields.model;
  if (fields.type !== undefined) updates.type = fields.type;
  if (fields.config !== undefined) updates.config = fields.config;
  if (fields.promptId !== undefined) updates.prompt_id = fields.promptId;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("agents")
      .update(updates)
      .eq("id", agentId)
      .eq("workspace_id", workspaceId);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 403 });

    void logAudit({
      workspaceId,
      actorUserId: user.id,
      action: "agent.update",
      targetType: "agent",
      targetId: agentId,
      summary: `Editó ${Object.keys(updates).join(", ")} de ${agentLabel}`,
      metadata: { fields: Object.keys(updates) },
    });
  }

  if (setActive === true) {
    // Verify admin/manager before the service-role RPC.
    const { data: membership } = await supabase
      .from("memberships")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    const role = (membership as { role?: string } | null)?.role;
    if (role !== "admin" && role !== "manager") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }
    const { error: rpcError } = await svc().rpc("set_active_agent", {
      p_workspace: workspaceId,
      p_agent: agentId,
    });
    if (rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 });

    void logAudit({
      workspaceId,
      actorUserId: user.id,
      action: "agent.activate",
      targetType: "agent",
      targetId: agentId,
      summary: `Activó a ${agentLabel} como agente de este workspace`,
      metadata: {},
    });
  }

  // Return the fresh row (with prompt body).
  try {
    const agents = await listAgents(supabase, workspaceId);
    const agent = agents.find((a) => a.id === agentId);
    if (!agent)
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ agent });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
