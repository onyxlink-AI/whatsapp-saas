// F7: Prompt resolver — hierarchy-based system prompt selection.
// Resolves the most specific published prompt for a given context.

import { createClient as createSbClient } from "@supabase/supabase-js";
import type { PromptGuardrails } from "./prompt-builder";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface ResolvedPrompt {
  body: string;
  promptId: string;
  versionId: string;
  scope: string;
  guardrails: PromptGuardrails | null;
}

// Most-specific scopes first — first match wins
const SCOPE_PRIORITY = [
  "mode",
  "segment",
  "campaign",
  "number",
  "global",
] as const;

type Scope = (typeof SCOPE_PRIORITY)[number];

export interface PromptContext {
  number?: string;
  segment?: string;
  campaign?: string;
  mode?: string;
}

/**
 * Resolves one explicitly selected prompt. Agent profiles use this path so two
 * agents with the same role never share instructions by accident.
 */
export async function resolvePromptById(
  workspaceId: string,
  promptId: string,
): Promise<ResolvedPrompt | null> {
  const supabase = svc();
  const { data, error } = await supabase
    .from("prompts")
    .select(
      `
      id,
      scope,
      active_version_id,
      prompt_versions!active_version_id (
        id,
        body,
        state,
        guardrails
      )
    `,
    )
    .eq("workspace_id", workspaceId)
    .eq("id", promptId)
    .maybeSingle();

  if (error || !data) return null;

  type VersionRow = {
    id: string;
    body: string;
    state: string;
    guardrails: PromptGuardrails | null;
  };
  const rawVersion = data.prompt_versions as unknown;
  const version: VersionRow | null = Array.isArray(rawVersion)
    ? ((rawVersion[0] as VersionRow) ?? null)
    : (rawVersion as VersionRow | null);
  if (!version || version.state !== "published") return null;

  return {
    body: version.body,
    promptId: data.id as string,
    versionId: version.id,
    scope: data.scope as string,
    guardrails: version.guardrails ?? null,
  };
}

/**
 * Resolves the most specific active+published system prompt for a workspace.
 * Tries each scope in priority order (mode > segment > campaign > number > global).
 * Returns null when no published prompt exists — caller should use a default.
 */
export async function resolveSystemPrompt(
  workspaceId: string,
  context: PromptContext,
): Promise<ResolvedPrompt | null> {
  const supabase = svc();

  for (const scope of SCOPE_PRIORITY) {
    const scopeRef = context[scope as keyof PromptContext];

    // Build the query base
    let query = supabase
      .from("prompts")
      .select(
        `
        id,
        scope,
        active_version_id,
        prompt_versions!active_version_id (
          id,
          body,
          state,
          guardrails
        )
      `,
      )
      .eq("workspace_id", workspaceId)
      .eq("scope", scope)
      .not("active_version_id", "is", null);

    // For non-global scopes, filter by scope_ref when provided
    if (scope !== "global" && scopeRef) {
      query = query.eq("scope_ref", scopeRef);
    } else if (scope !== "global" && !scopeRef) {
      // No ref for this scope in context — skip it
      continue;
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
      console.error(`[prompt-resolver] scope=${scope} query error:`, error);
      continue;
    }

    if (!data) continue;

    // Validate the joined version is published.
    // Supabase returns the FK-hint join as an array; cast through unknown to
    // avoid TS overlap error, then normalise to a single object or null.
    type VersionRow = {
      id: string;
      body: string;
      state: string;
      guardrails: PromptGuardrails | null;
    };
    const rawVersion = data.prompt_versions as unknown;
    const version: VersionRow | null = Array.isArray(rawVersion)
      ? ((rawVersion[0] as VersionRow) ?? null)
      : (rawVersion as VersionRow | null);

    if (!version || version.state !== "published") continue;

    return {
      body: version.body,
      promptId: data.id as string,
      versionId: version.id,
      scope: data.scope as string,
      guardrails: version.guardrails ?? null,
    };
  }

  return null;
}

/**
 * Publishes a specific prompt version.
 * Sets the version to published, updates active_version_id on the prompt,
 * and marks all other versions of that prompt as draft — atomically, and
 * scoped to `workspaceId` (see publish_prompt_version() migration:
 * without that scope, a caller who merely knew a prompt/version id from a
 * DIFFERENT workspace could publish it there).
 */
export async function publishPromptVersion(
  workspaceId: string,
  promptId: string,
  versionId: string,
): Promise<void> {
  const supabase = svc();

  const { error } = await supabase.rpc("publish_prompt_version", {
    p_workspace: workspaceId,
    p_prompt: promptId,
    p_version: versionId,
  });

  if (error) {
    throw new Error(`[prompt-resolver] failed to publish version: ${error.message}`);
  }
}

/**
 * Creates a new draft version for a prompt.
 * Auto-increments the version number based on the latest existing version.
 * Returns the new version id.
 */
export async function createPromptVersion(
  workspaceId: string,
  promptId: string,
  body: string,
  variables?: unknown[],
  guardrails?: PromptGuardrails | null,
): Promise<string> {
  const supabase = svc();

  // Get the current max version number for this prompt
  const { data: existing } = await supabase
    .from("prompt_versions")
    .select("version")
    .eq("prompt_id", promptId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion =
    existing && typeof existing.version === "number" ? existing.version + 1 : 1;

  const { data, error } = await supabase
    .from("prompt_versions")
    .insert({
      workspace_id: workspaceId,
      prompt_id: promptId,
      version: nextVersion,
      state: "draft",
      body,
      variables: variables ?? [],
      guardrails: guardrails ?? {},
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `[prompt-resolver] failed to create version: ${error?.message}`,
    );
  }

  return data.id as string;
}

/**
 * Lists all prompts for a workspace, joining their active version body.
 */
export async function listPrompts(workspaceId: string): Promise<unknown[]> {
  const supabase = svc();

  const { data, error } = await supabase
    .from("prompts")
    .select(
      `
      id,
      name,
      scope,
      scope_ref,
      active_version_id,
      created_at,
      prompt_versions (
        id,
        version,
        state,
        body,
        published_at,
        created_at
      )
    `,
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`[prompt-resolver] listPrompts error: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Upserts a global-scope prompt for a workspace.
 * Returns the prompt id — creates if missing, returns existing id otherwise.
 */
export async function upsertGlobalPrompt(
  workspaceId: string,
  name: string,
): Promise<string> {
  const supabase = svc();

  const { data, error } = await supabase
    .from("prompts")
    .upsert(
      { workspace_id: workspaceId, scope: "global", name },
      { onConflict: "workspace_id,scope,scope_ref" },
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `[prompt-resolver] upsertGlobalPrompt error: ${error?.message}`,
    );
  }

  return data.id as string;
}
